/**
 * Genially links as a teacher (or the assistant) writes them: the lesson editor's
 * form and the MCP tools read them the same way. A Genially is shown in an
 * <iframe> of view.genially.com; only that address is ever embedded.
 */

const GENIALLY_ID = /^[0-9a-f]{24}$/i;
const GENIALLY_HOSTS = new Set(['view.genially.com', 'view.genial.ly', 'genially.com', 'app.genially.com']);

/** The address the player embeds. */
export const geniallyEmbedUrl = (id: string) => `https://view.genially.com/${id}`;

/**
 * A Genially as the teacher copies it: the link of the published creation
 * (view.genially.com/<id>, with or without the name after it), the whole
 * <iframe> code of "Share → Embed", or a bare id → its id. null if it is not
 * a Genially.
 */
export function parseGeniallyLink(input: string): string | null {
  let value = input.trim();
  // The embed code: take the address out of src="…".
  const src = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(value)?.[1];
  if (src) value = src.replace(/&amp;/g, '&');
  if (GENIALLY_ID.test(value)) return value.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!GENIALLY_HOSTS.has(url.hostname.toLowerCase())) return null;
  const id = url.pathname.split('/').find((part) => GENIALLY_ID.test(part));
  return id ? id.toLowerCase() : null;
}
