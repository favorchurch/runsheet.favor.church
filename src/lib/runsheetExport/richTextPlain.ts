import { extractCellUrl } from '@/lib/richText';

/**
 * Converts rich-text HTML stored in runsheet cells into clean, readable plain text.
 *
 * Rules:
 * - Runs `extractCellUrl` first to extract any attached cell reference/file URL.
 * - Items in `<ol>` receive numbered prefixes (`1. `, `2. `, ...).
 * - Items in `<ul>` receive bullet prefixes (`• `).
 * - Line breaks (`<br>`) and block closing tags become newlines.
 * - Remaining HTML tags are stripped and standard HTML entities are decoded.
 * - If a cell URL was extracted, it is appended to the visible text.
 */
export function runsheetRichTextToPlainText(html: string): string {
  if (!html) return '';

  const { contentHtml, url } = extractCellUrl(html);

  // Convert ordered lists
  let processed = contentHtml.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_: string, inner: string) => {
    let index = 1;
    return inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match: string, itemText: string) => {
      const num = index++;
      return `\n${num}. ${itemText.trim()}\n`;
    });
  });

  // Convert unordered lists
  processed = processed.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_: string, inner: string) => {
    return inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match: string, itemText: string) => {
      return `\n• ${itemText.trim()}\n`;
    });
  });

  // Convert any orphaned <li> tags
  processed = processed.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, itemText) => {
    return `\n• ${itemText.trim()}\n`;
  });

  // Convert line breaks and block tags
  processed = processed
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');

  // Normalize line endings and whitespace
  const cleanedText = processed
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();

  // Append extracted cell URL as visible text
  if (url) {
    return cleanedText ? `${cleanedText}\n${url}` : url;
  }

  return cleanedText;
}
