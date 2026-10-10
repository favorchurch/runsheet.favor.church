import { NOTO_SANS_KR_RANGES } from './fontCoverageKr';

export { NOTO_SANS_KR_RANGES };

/**
 * Code point ranges present in the bundled Noto Sans (Regular and Bold share
 * one cmap), as [first, last] inclusive pairs. Anything outside them has no
 * glyph in the PDF font, so the export model substitutes it before layout.
 *
 * Generated from `public/fonts/NotoSans-Regular.ttf`; fontCoverage.test.ts
 * checks every range against the real font so a font swap cannot drift from it.
 */
export const NOTO_SANS_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x0000],
  [0x000D, 0x000D],
  [0x0020, 0x007E],
  [0x00A0, 0x0377],
  [0x037A, 0x037F],
  [0x0384, 0x038A],
  [0x038C, 0x038C],
  [0x038E, 0x03A1],
  [0x03A3, 0x03E1],
  [0x03F0, 0x052F],
  [0x0900, 0x097F],
  [0x10FB, 0x10FB],
  [0x1AB0, 0x1AC0],
  [0x1AC5, 0x1AC5],
  [0x1AC7, 0x1ACE],
  [0x1C80, 0x1C88],
  [0x1D00, 0x1DF9],
  [0x1DFB, 0x1F15],
  [0x1F18, 0x1F1D],
  [0x1F20, 0x1F45],
  [0x1F48, 0x1F4D],
  [0x1F50, 0x1F57],
  [0x1F59, 0x1F59],
  [0x1F5B, 0x1F5B],
  [0x1F5D, 0x1F5D],
  [0x1F5F, 0x1F7D],
  [0x1F80, 0x1FB4],
  [0x1FB6, 0x1FC4],
  [0x1FC6, 0x1FD3],
  [0x1FD6, 0x1FDB],
  [0x1FDD, 0x1FEF],
  [0x1FF2, 0x1FF4],
  [0x1FF6, 0x1FFE],
  [0x2000, 0x2064],
  [0x2066, 0x2071],
  [0x2074, 0x208E],
  [0x2090, 0x209C],
  [0x20A0, 0x20C0],
  [0x20F0, 0x20F0],
  [0x2100, 0x215F],
  [0x2183, 0x2184],
  [0x2189, 0x2189],
  [0x2212, 0x2212],
  [0x25CC, 0x25CC],
  [0x2C60, 0x2C7F],
  [0x2DE0, 0x2E5D],
  [0xA640, 0xA69F],
  [0xA700, 0xA7CA],
  [0xA7D0, 0xA7D1],
  [0xA7D3, 0xA7D3],
  [0xA7D5, 0xA7D9],
  [0xA7F2, 0xA7FF],
  [0xA8FF, 0xA8FF],
  [0xA92E, 0xA92E],
  [0xAB30, 0xAB6B],
  [0xFB00, 0xFB06],
  [0xFE00, 0xFE00],
  [0xFE20, 0xFE2F],
  [0xFEFF, 0xFEFF],
  [0xFFFC, 0xFFFD],
  [0x10780, 0x10785],
  [0x10787, 0x107B0],
  [0x107B2, 0x107BA],
  [0x1DF00, 0x1DF1E],
];

function inRanges(ranges: ReadonlyArray<readonly [number, number]>, codePoint: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = ranges[mid];
    if (codePoint < start) {
      high = mid - 1;
    } else if (codePoint > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a Unicode code point has a glyph in the bundled Noto Sans or
 * its Noto Sans KR fallback.
 */
export function isSupportedCodePoint(codePoint: number): boolean {
  return inRanges(NOTO_SANS_RANGES, codePoint) || inRanges(NOTO_SANS_KR_RANGES, codePoint);
}

/**
 * Checks whether the given text contains any glyphs that cannot be rendered
 * by Noto Sans or Noto Sans KR (excluding control/whitespace characters \n, \r, \t).
 */
export function hasUnsupportedGlyphs(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    if (char === '\n' || char === '\r' || char === '\t') continue;
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || !isSupportedCodePoint(codePoint)) {
      return true;
    }
  }
  return false;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isLayoutWhitespace(char: string): boolean {
  return char === '\n' || char === '\r' || char === '\t';
}

/**
 * Deterministically replaces any grapheme cluster that the bundled fonts cannot
 * fully render (e.g. emoji, including variation-selector and ZWJ sequences) with
 * a single safe fallback glyph (defaults to '?').
 * Control characters \n, \r, \t are preserved for layout.
 */
export function sanitizeTextForFont(text: string, fallback = '?'): string {
  if (!text) return '';
  let result = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const chars = Array.from(segment);
    if (chars.every((c) => isLayoutWhitespace(c) || isSupportedCodePoint(c.codePointAt(0)!))) {
      result += segment;
    } else {
      result += fallback;
    }
  }
  return result;
}
