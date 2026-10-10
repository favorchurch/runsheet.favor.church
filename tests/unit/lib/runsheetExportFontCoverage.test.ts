import { describe, expect, it } from '@jest/globals';
import fontkit from 'fontkit';
import path from 'path';
import {
  hasUnsupportedGlyphs,
  isSupportedCodePoint,
  NOTO_SANS_RANGES,
  sanitizeTextForFont,
} from '@/lib/runsheetExport';

describe('runsheetExport font coverage', () => {
  it('checks every range in NOTO_SANS_RANGES against the real bundled Noto Sans font', () => {
    const fontPath = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
    const font = fontkit.openSync(fontPath);
    const fontCharSet = new Set(font.characterSet);

    // 1. Verify every character in NOTO_SANS_RANGES is actually present in the font
    for (const [start, end] of NOTO_SANS_RANGES) {
      for (let cp = start; cp <= end; cp++) {
        expect(fontCharSet.has(cp)).toBe(true);
      }
    }

    // 2. Verify every character in font is accounted for in NOTO_SANS_RANGES
    let totalRangeChars = 0;
    for (const [start, end] of NOTO_SANS_RANGES) {
      totalRangeChars += end - start + 1;
    }
    expect(totalRangeChars).toBe(fontCharSet.size);
  });

  it('correctly identifies supported vs unsupported code points', () => {
    expect(isSupportedCodePoint('A'.charCodeAt(0))).toBe(true);
    expect(isSupportedCodePoint('1'.charCodeAt(0))).toBe(true);
    // Non-Latin: Greek and Cyrillic
    expect(isSupportedCodePoint('Ε'.codePointAt(0)!)).toBe(true);
    expect(isSupportedCodePoint('П'.codePointAt(0)!)).toBe(true);

    // Emojis are unsupported
    expect(isSupportedCodePoint('😊'.codePointAt(0)!)).toBe(false);
    expect(isSupportedCodePoint('🎉'.codePointAt(0)!)).toBe(false);
  });

  it('sanitizes text by replacing unsupported glyphs with safe fallback', () => {
    const textWithEmoji = 'Welcome 🙏 to Favor Church! 🎉';
    expect(hasUnsupportedGlyphs(textWithEmoji)).toBe(true);

    const sanitized = sanitizeTextForFont(textWithEmoji);
    expect(hasUnsupportedGlyphs(sanitized)).toBe(false);
    expect(sanitized).toBe('Welcome ? to Favor Church! ?');
  });

  it('preserves newlines, tabs, and carriage returns during sanitization', () => {
    const multiline = 'Line 1\nLine 2\tTabbed\rLine 3';
    expect(sanitizeTextForFont(multiline)).toBe(multiline);
  });
});
