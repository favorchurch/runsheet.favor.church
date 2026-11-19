import { describe, expect, it } from '@jest/globals';
import { htmlToPlainText, isRichTextEmpty, legacyValueToHtml, normalizeRichTextValue } from './richText';

describe('legacyValueToHtml', () => {
  it('wraps plain text in a paragraph', () => {
    expect(legacyValueToHtml('Doors Open')).toBe('<p>Doors Open</p>');
  });

  it('converts the old bold and italic markers', () => {
    expect(legacyValueToHtml('**Sermon**')).toBe('<p><strong>Sermon</strong></p>');
    // `~~` meant italics in the previous editor, not strikethrough.
    expect(legacyValueToHtml('~~note~~')).toBe('<p><em>note</em></p>');
  });

  it('turns newlines into line breaks within one paragraph', () => {
    expect(legacyValueToHtml('Tithes\nNew People')).toBe('<p>Tithes<br>New People</p>');
  });

  it('escapes markup typed as literal text', () => {
    expect(legacyValueToHtml('5 < 6 & "quoted"')).toBe('<p>5 &lt; 6 &amp; &quot;quoted&quot;</p>');
  });

  it('leaves values that are already rich text untouched', () => {
    const html = '<p><strong>MC1</strong></p>';
    expect(legacyValueToHtml(html)).toBe(html);
  });

  it('still upgrades markers inside hand-typed html', () => {
    expect(legacyValueToHtml('<b>Cue</b> **now**')).toBe('<b>Cue</b> <strong>now</strong>');
  });

  it('returns an empty string for empty input', () => {
    expect(legacyValueToHtml('')).toBe('');
  });
});

describe('htmlToPlainText', () => {
  it('strips tags', () => {
    expect(htmlToPlainText('<p><strong>Sermon</strong></p>')).toBe('Sermon');
  });

  it('keeps line structure from breaks and block ends', () => {
    expect(htmlToPlainText('<p>One<br>Two</p><p>Three</p>')).toBe('One\nTwo\nThree');
  });

  it('decodes entities without double-decoding', () => {
    expect(htmlToPlainText('<p>Tithes &amp; Offerings</p>')).toBe('Tithes & Offerings');
    expect(htmlToPlainText('<p>&amp;lt;</p>')).toBe('&lt;');
  });

  it('drops colour markup but keeps the text', () => {
    expect(htmlToPlainText('<p><span style="color: #dc2626">Late</span></p>')).toBe('Late');
  });

  it('strips rich-text and nested HTML tags from activity titles', () => {
    expect(htmlToPlainText('<p><strong>Runsheet Huddle</strong></p>')).toBe('Runsheet Huddle');
    expect(htmlToPlainText('<p><strong>All-In Huddle</strong></p>')).toBe('All-In Huddle');
    expect(
      htmlToPlainText('<div><p><span style="color: #111827"><strong><em>Worship</em></strong></span></p></div>'),
    ).toBe('Worship');
  });

  it('decodes &amp;, &nbsp;, and &#39; entities cleanly', () => {
    expect(htmlToPlainText('<p>Pastor&nbsp;Rico&#39;s Q&amp;A</p>')).toBe("Pastor Rico's Q&A");
    expect(htmlToPlainText('<p>It&#x27;s&nbsp;Ready</p>')).toBe("It's Ready");
  });

  it('strips script, style, and event-handler payloads safely', () => {
    expect(htmlToPlainText('<script>alert("xss")</script><p><strong>Runsheet Huddle</strong></p>')).toBe(
      'Runsheet Huddle',
    );
    expect(htmlToPlainText('<style>body{display:none}</style><p>All-In Huddle</p>')).toBe('All-In Huddle');
    expect(
      htmlToPlainText('<p onload="alert(1)" onclick="evil()"><img src="x" onerror="alert(2)" />Doors Open</p>'),
    ).toBe('Doors Open');
    expect(htmlToPlainText('<script>alert(1)</script>')).toBe('');
  });

  it('leaves plain-text titles untouched', () => {
    expect(htmlToPlainText('Doors Open')).toBe('Doors Open');
  });
});

describe('isRichTextEmpty', () => {
  it("treats the editor's empty document as empty", () => {
    expect(isRichTextEmpty('<p></p>')).toBe(true);
    expect(isRichTextEmpty('<p><br></p>')).toBe(true);
  });

  it('treats any visible text as non-empty', () => {
    expect(isRichTextEmpty('<p>a</p>')).toBe(false);
  });
});

describe('normalizeRichTextValue', () => {
  it('stores blank cells as an empty string', () => {
    expect(normalizeRichTextValue('<p></p>')).toBe('');
  });

  it('preserves formatted content', () => {
    expect(normalizeRichTextValue('<p><em>cue</em></p>')).toBe('<p><em>cue</em></p>');
  });
});

describe('round trip', () => {
  it.each([
    '**Runsheet Huddle**',
    'Pray out of Worship\nTithes & Offerings\n**Next Steps:**',
    'Plain segment',
  ])('keeps the readable text of %p', (legacy) => {
    const asHtml = legacyValueToHtml(legacy);
    const expected = legacy.replace(/\*\*/g, '').replace(/~~/g, '');
    expect(htmlToPlainText(asHtml)).toBe(expected);
  });
});
