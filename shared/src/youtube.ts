/**
 * YouTube links and start times as a teacher (or the assistant) writes them:
 * the lesson editor's video form and the MCP tools read them the same way.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);

/** "90", "1m30s", "1h2m" (YouTube's t= / start=) → seconds. */
function parseYoutubeTime(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match?.[0]) return undefined;
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * A YouTube link as the teacher copies it (watch?v=, youtu.be/, /shorts/,
 * /embed/, /live/) or a bare id → the video id and the start time in the link,
 * if any. null if it is not a YouTube video.
 */
export function parseYoutubeLink(input: string): { id: string; start?: number } | null {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return { id: value };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id: string | null | undefined;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (YOUTUBE_HOSTS.has(host)) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname)?.[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const start = parseYoutubeTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return start ? { id, start } : { id };
}

/** "1:30" or "90" → 90 seconds; "" → undefined (from the start); null if not a time. */
export function parseTime(input: string): number | undefined | null {
  const value = input.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 90 → "1:30". */
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
