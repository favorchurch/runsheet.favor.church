import { describe, expect, it } from '@jest/globals';
import {
  embedCellUrl,
  extractCellUrl,
  htmlToPlainText,
  isRichTextEmpty,
  normalizeRichTextValue,
  RICH_TEXT_ALLOWED_ATTR,
  RICH_TEXT_ALLOWED_TAGS,
} from '@/lib/richText';

describe('RICH_TEXT_ALLOWED_TAGS and RICH_TEXT_ALLOWED_ATTR', () => {
  it('allows anchor tag <a> in RICH_TEXT_ALLOWED_TAGS', () => {
    expect(RICH_TEXT_ALLOWED_TAGS).toContain('a');
  });

  it('allows href, target, rel, data-cell-url, class, and style in RICH_TEXT_ALLOWED_ATTR', () => {
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('href');
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('target');
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('rel');
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('data-cell-url');
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('class');
    expect(RICH_TEXT_ALLOWED_ATTR).toContain('style');
  });
});

describe('extractCellUrl and embedCellUrl', () => {
  it('embeds a URL into content HTML as a runsheet-cell-link anchor', () => {
    const html = '<p>Order of Service</p>';
    const url = 'https://docs.google.com/document/d/123/edit';
    const embedded = embedCellUrl(html, url);

    expect(embedded).toContain('https://docs.google.com/document/d/123/edit');
    expect(embedded).toContain('data-cell-url="https://docs.google.com/document/d/123/edit"');
    expect(embedded).toContain('class="runsheet-cell-link"');
    expect(embedded).toContain('target="_blank"');
    expect(embedded).toContain('rel="noopener noreferrer"');
  });

  it('embeds a URL when content HTML is empty', () => {
    const url = 'https://favor.church';
    const embedded = embedCellUrl('', url);
    expect(embedded).toContain('data-cell-url="https://favor.church"');
  });

  it('returns clean HTML when url is null or empty', () => {
    const html = '<p>Plain note</p>';
    expect(embedCellUrl(html, null)).toBe('<p>Plain note</p>');
    expect(embedCellUrl(html, '')).toBe('<p>Plain note</p>');
    expect(embedCellUrl(html, '   ')).toBe('<p>Plain note</p>');
  });

  it('replaces an existing embedded URL when embedding a new one', () => {
    const initial = embedCellUrl('<p>Worship Set</p>', 'https://old-link.com');
    const updated = embedCellUrl(initial, 'https://new-link.com');

    expect(updated).not.toContain('old-link.com');
    expect(updated).toContain('new-link.com');
    const extracted = extractCellUrl(updated);
    expect(extracted.url).toBe('https://new-link.com');
    expect(extracted.contentHtml).toBe('<p>Worship Set</p>');
  });

  it('removes an existing embedded URL when embedding empty or null', () => {
    const initial = embedCellUrl('<p>Worship Set</p>', 'https://old-link.com');
    const removed = embedCellUrl(initial, null);

    expect(removed).toBe('<p>Worship Set</p>');
    const extracted = extractCellUrl(removed);
    expect(extracted.url).toBeNull();
    expect(extracted.contentHtml).toBe('<p>Worship Set</p>');
  });

  it('extracts URL and content HTML from stored value', () => {
    const stored =
      '<p><strong>Runsheet Huddle</strong></p><a href="https://favor.church/plan.pdf" data-cell-url="https://favor.church/plan.pdf" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://favor.church/plan.pdf</a>';
    const result = extractCellUrl(stored);

    expect(result.url).toBe('https://favor.church/plan.pdf');
    expect(result.contentHtml).toBe('<p><strong>Runsheet Huddle</strong></p>');
  });

  it('returns null url and original html when no embedded URL exists', () => {
    const result = extractCellUrl('<p>No links here</p>');
    expect(result.url).toBeNull();
    expect(result.contentHtml).toBe('<p>No links here</p>');
  });

  it('handles empty or null string gracefully in extractCellUrl', () => {
    expect(extractCellUrl('')).toEqual({ contentHtml: '', url: null });
  });
});

describe('htmlToPlainText with cell URLs', () => {
  it('excludes embedded cell link anchor tags from plain text output', () => {
    const stored =
      '<p>Pre-Service Prayer</p><a href="https://example.com" data-cell-url="https://example.com" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://example.com</a>';
    expect(htmlToPlainText(stored)).toBe('Pre-Service Prayer');
  });

  it('returns empty plain text if only a cell link is present', () => {
    const stored =
      '<a href="https://example.com" data-cell-url="https://example.com" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://example.com</a>';
    expect(htmlToPlainText(stored)).toBe('');
  });
});

describe('isRichTextEmpty and normalizeRichTextValue with cell URLs', () => {
  it('treats a cell containing only a cell URL as non-empty', () => {
    const stored =
      '<a href="https://favor.church/runsheet.pdf" data-cell-url="https://favor.church/runsheet.pdf" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://favor.church/runsheet.pdf</a>';
    expect(isRichTextEmpty(stored)).toBe(false);
    expect(normalizeRichTextValue(stored)).toBe(stored);
  });
});
