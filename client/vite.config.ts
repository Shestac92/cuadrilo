import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import en from '../shared/src/i18n/en';
import es from '../shared/src/i18n/es';
import { DEFAULT_PLATFORM_NAME } from '../shared/src/platform';

// Settings of this installation (see .env.example); a variable set in the shell wins.
const envFile = path.resolve(import.meta.dirname, '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * The interface language is chosen at build time (APP_LANG, es by default):
 * only that language's texts go into the bundle. The server reads the same
 * variable for its messages.
 */
const lang = process.env.APP_LANG ?? 'es';
if (lang !== 'es' && lang !== 'en') throw new Error(`APP_LANG=${lang}: expected es or en`);
const messages = { es, en }[lang];

/** The platform's name (PLATFORM_NAME): in the page, the notices and the privacy policy. */
const platformName = process.env.PLATFORM_NAME || DEFAULT_PLATFORM_NAME;

/** Text as the content of an HTML element. */
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * <html lang>, the page title and the notices of the page itself (the app did not start: an old browser, no
 * JavaScript) in the interface language. The notices are in index.html: the app's own code cannot show them.
 */
const htmlLanguage = (): Plugin => ({
  name: 'html-language',
  transformIndexHtml: (html) =>
    html
      .replace('<html lang="es">', `<html lang="${lang}">`)
      .replace(/<title>.*<\/title>/, `<title>${platformName} — ${messages.app.tagline}</title>`)
      // In a <script>: JSON with < escaped, so no text can close the tag.
      .replace('__BROWSER_MESSAGE__', JSON.stringify(messages.app.browserTooOld).replace(/</g, '\\u003c'))
      .replace('__NOSCRIPT_MESSAGE__', escapeHtml(messages.app.noScript)),
});

/**
 * The icon of the tab (FAVICON): the path of a .svg, .png or .ico file, a relative one from the repository root.
 * It is copied into the build as brand-icon.<extension> and the page points at it; without FAVICON the
 * client's own public/favicon.svg stays. The path is read at build time: change it, build again.
 */
const FAVICON_TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const favicon = (): Plugin => {
  const configured = process.env.FAVICON;
  if (!configured) return { name: 'favicon' };
  const file = path.resolve(import.meta.dirname, '..', configured);
  const extension = path.extname(file).toLowerCase();
  const type = FAVICON_TYPES[extension];
  if (!type) throw new Error(`FAVICON=${configured}: expected a .svg, .png or .ico file`);
  if (!fs.existsSync(file)) throw new Error(`FAVICON=${configured}: no such file (${file})`);
  const name = `brand-icon${extension}`;
  return {
    name: 'favicon',
    transformIndexHtml: (html) =>
      html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="${type}" href="/${name}" />`),
    configureServer(server) {
      server.middlewares.use(`/${name}`, (_request, response) => {
        response.setHeader('Content-Type', type);
        response.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: name, source: fs.readFileSync(file) });
    },
  };
};

/**
 * The privacy policies (every docs/privacy.<language code>.md) as the module `virtual:privacy-policy`:
 * an object code → text, the operator's notes cut off, {{placeholders}} filled from .env. All the
 * languages are in every build, whatever the interface language: a student must be able to read the
 * policy in their own. A new language is a new file (restart the dev server to see it).
 */
const PRIVACY_PLACEHOLDERS: Record<string, string | undefined> = {
  platformName,
  teacherName: process.env.CONTROLLER_NAME,
  teacherContact: process.env.CONTROLLER_CONTACT,
  hostName: process.env.HOST_NAME,
  hostingCountry: process.env.HOSTING_COUNTRY,
  transferNote: process.env.TRANSFER_NOTE,
};
/** May stay empty: it is one optional sentence. */
const OPTIONAL_PLACEHOLDERS = new Set(['transferNote']);
const privacyPolicy = (): Plugin => {
  const id = 'virtual:privacy-policy';
  const docs = path.resolve(import.meta.dirname, '../docs');
  return {
    name: 'privacy-policy',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      const empty = new Set<string>();
      const policies: Record<string, string> = {};
      for (const name of fs.readdirSync(docs).sort()) {
        const code = /^privacy\.([a-z]{2,3}(?:-[A-Za-z]+)?)\.md$/.exec(name)?.[1];
        if (!code) continue;
        const file = path.join(docs, name);
        this.addWatchFile(file);
        const published = fs.readFileSync(file, 'utf8').split(/\n---\n\n### /)[0];
        policies[code] = published.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) => {
          const value = PRIVACY_PLACEHOLDERS[placeholder];
          if (value) return value;
          if (OPTIONAL_PLACEHOLDERS.has(placeholder)) return '';
          empty.add(placeholder);
          return `{{${placeholder}}}`;
        });
      }
      if (empty.size > 0) this.warn(`privacy policy: set in .env the values for ${[...empty].join(', ')}`);
      return `export default ${JSON.stringify(policies)};`;
    },
  };
};

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8080}`;
// Keep the browser's Host header (changeOrigin: false): the server compares it
// with the Origin header to reject cross-site requests (server/src/security.ts).
const proxy = { target: apiTarget, changeOrigin: false };
const proxyRoutes = {
  '/api': proxy,
  '/socket.io': { ...proxy, ws: true },
  // Lesson images and audio (data/media, served by the backend).
  '/media': proxy,
  // AI assistants: OAuth discovery and endpoints, and the MCP server. The
  // consent page /oauth/consent is the client's own route, not proxied.
  '/.well-known': proxy,
  '^/oauth/(authorize|token|register|revoke)': proxy,
  '/mcp': proxy,
};

// Public hostnames allowed to reach `vite preview` (npm run share), e.g. an
// ngrok tunnel; comma-separated in SHARE_HOSTS (none by default).
const shareHosts = (process.env.SHARE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), htmlLanguage(), favicon(), privacyPolicy()],
  define: { __APP_LANG__: JSON.stringify(lang), __PLATFORM_NAME__: JSON.stringify(platformName) },
  resolve: {
    // The texts of the chosen language (typed by es.ts, see tsconfig "paths").
    alias: { '@cuadrilo/messages': path.resolve(__dirname, `../shared/src/i18n/${lang}.ts`) },
  },
  server: {
    port: 5173,
    proxy: proxyRoutes,
  },
  // Built client (client/dist) for showing the app through a tunnel: unlike the
  // dev server, preview serves nothing but the build output.
  preview: {
    port: 4173,
    strictPort: true,
    allowedHosts: shareHosts,
    proxy: proxyRoutes,
  },
});
