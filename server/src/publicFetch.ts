import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import net from 'node:net';

import { PLATFORM_NAME } from './platform';

/**
 * Downloads from a URL that came from outside (an OAuth client metadata
 * document, a file an assistant asks the server to fetch) without letting it
 * reach inside: https only, and the host's addresses must be public — checked
 * when the connection is made, so a name that resolves differently the second
 * time (DNS rebinding) cannot slip through. Redirects are followed by hand,
 * each hop checked again. Time and size are limited.
 */

/** Tests serve documents and files from 127.0.0.1 over http: ALLOW_LOCAL_FETCH=1 lets them through. */
export const ALLOW_LOCAL_FETCH = process.env.ALLOW_LOCAL_FETCH === '1';

export type PublicFetchResult =
  | { ok: true; bytes: Buffer; contentType: string | undefined; url: string }
  | {
      ok: false;
      reason: 'url' | 'address' | 'status' | 'too_large' | 'timeout' | 'redirects' | 'network';
      status?: number;
    };

interface Options {
  maxBytes: number;
  timeoutMs: number;
  /** 0: a redirect is an error. */
  maxRedirects: number;
  accept?: string;
}

/** Loopback, private, link-local and other non-public addresses (no requests to the inside). */
export function isNonPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isNonPublicAddress(lower.slice('::ffff:'.length));
  return (
    lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  );
}

class NonPublicAddressError extends Error {}

/** DNS lookup for the connection itself: fails if any address of the host is not public. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    if (addresses.length === 0 || addresses.some(({ address }) => isNonPublicAddress(address))) {
      return callback(new NonPublicAddressError(hostname), '', 0);
    }
    if (options.all) return (callback as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

/** The URL as a request target, or undefined if it may not be fetched (scheme, credentials, an IP inside). */
function checkUrl(raw: string, base?: URL): URL | undefined {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;
  if (ALLOW_LOCAL_FETCH) return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
  if (url.protocol !== 'https:') return undefined;
  // An IP address is connected to without a lookup: check it here.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isNonPublicAddress(host)) return undefined;
  return url;
}

type HopResult = PublicFetchResult | { ok: false; reason: 'redirect'; location: string };

function requestOnce(url: URL, options: Options, signal: AbortSignal): Promise<HopResult> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const request = client.get(
      url,
      {
        signal,
        headers: { Accept: options.accept ?? '*/*', 'User-Agent': PLATFORM_NAME },
        ...(ALLOW_LOCAL_FETCH ? {} : { lookup: publicOnlyLookup }),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ ok: false, reason: 'redirect', location: response.headers.location });
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({ ok: false, reason: 'status', status });
        }
        if (Number(response.headers['content-length']) > options.maxBytes) {
          response.destroy();
          return resolve({ ok: false, reason: 'too_large' });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            resolve({ ok: false, reason: 'too_large' });
          } else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            ok: true,
            bytes: Buffer.concat(chunks),
            contentType: response.headers['content-type'],
            url: url.href,
          }),
        );
        response.on('error', () => resolve({ ok: false, reason: signal.aborted ? 'timeout' : 'network' }));
      },
    );
    request.on('error', (error) => {
      const reason = signal.aborted ? 'timeout' : error instanceof NonPublicAddressError ? 'address' : 'network';
      resolve({ ok: false, reason });
    });
  });
}

/** GET `raw` under the rules above; the body, or why not. */
export async function fetchPublic(raw: string, options: Options): Promise<PublicFetchResult> {
  let url = checkUrl(raw);
  if (!url) return { ok: false, reason: 'url' };
  // One deadline for all the hops.
  const signal = AbortSignal.timeout(options.timeoutMs);
  for (let hop = 0; ; hop++) {
    const result = await requestOnce(url, options, signal);
    if (result.ok || result.reason !== 'redirect') return result;
    if (hop >= options.maxRedirects) return { ok: false, reason: 'redirects' };
    url = checkUrl(result.location, url);
    if (!url) return { ok: false, reason: 'url' };
  }
}
