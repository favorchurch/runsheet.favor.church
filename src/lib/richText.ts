/**
 * Isomorphic rich-text helpers shared by the runsheet editor and the server
 * actions that persist runsheet values to Rock RMS.
 *
 * Runsheet cell values are stored in Rock as a small subset of HTML so editors
 * get spreadsheet-style formatting (bold, italics, colour, alignment) that
 * survives a round trip. Nothing in this module touches the DOM, so it is safe
 * to import from server actions. Browser-side sanitisation of untrusted HTML
 * lives in `sanitizeRichText.ts`.
 */

/** Tags the runsheet editor is allowed to produce and render. */
export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'span',
  'ul',
  'ol',
  'li',
] as const;

/** Attributes kept during sanitisation. `style` carries colour and alignment. */
export const RICH_TEXT_ALLOWED_ATTR = ['style'] as const;

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Upgrades a legacy cell value to the HTML the editor now stores.
 *
 * Before the WYSIWYG editor, cells held plain text with `**bold**` / `~~italic~~`
 * markers and raw newlines (and occasionally hand-typed `<b>` / `<i>` tags).
 * Values already containing HTML are passed through so re-saving is lossless.
 */
export function legacyValueToHtml(value: string): string {
  if (!value) return '';

  const containsHtml = HTML_TAG_PATTERN.test(value);
  const base = containsHtml ? value : escapeHtml(value);

  // `~~text~~` meant italics in the old editor, not strikethrough.
  const withMarks = base
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+?)~~/g, '<em>$1</em>');

  // A cell is a single block; newlines from the plain-text era become soft breaks.
  const withBreaks = withMarks.replace(/\r?\n/g, '<br>');

  return containsHtml ? withBreaks : `<p>${withBreaks}</p>`;
}

/**
 * Flattens rich text to plain text without a DOM, for contexts that must not
 * contain markup — notably the Rock `ContentChannelItem.Title` column.
 */
export function htmlToPlainText(value: string): string {
  if (!value) return '';

  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&') // must come last so `&amp;lt;` does not double-decode
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the value carries no visible text (e.g. Tiptap's empty `<p></p>`). */
export function isRichTextEmpty(value: string): boolean {
  return htmlToPlainText(value) === '';
}

/**
 * Canonical form for storage: blank cells persist as an empty string rather
 * than the editor's empty-document markup.
 */
export function normalizeRichTextValue(value: string): string {
  if (!value) return '';
  return isRichTextEmpty(value) ? '' : value.trim();
}
