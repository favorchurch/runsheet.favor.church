import { describe, expect, it } from '@jest/globals';
import {
  NOTO_SANS_RANGES,
  RUNSHEET_ERROR_STATUS_MAP,
  isSupportedCodePoint,
  sanitizeTextForFont,
} from './index';

describe('src/lib/runsheetExport exports and font safety', () => {
  it('exports RUNSHEET_ERROR_STATUS_MAP with required status codes', () => {
    expect(RUNSHEET_ERROR_STATUS_MAP['Invalid runsheet.']).toBe(400);
    expect(RUNSHEET_ERROR_STATUS_MAP['Runsheet not found.']).toBe(404);
    expect(RUNSHEET_ERROR_STATUS_MAP['You do not have access to this runsheet.']).toBe(403);
    expect(RUNSHEET_ERROR_STATUS_MAP['You do not have access to runsheets.']).toBe(403);
  });

  it('contains valid NOTO_SANS_RANGES', () => {
    expect(NOTO_SANS_RANGES.length).toBeGreaterThan(50);
    expect(isSupportedCodePoint(0x0041)).toBe(true); // 'A'
    expect(sanitizeTextForFont('Hello 😊 World')).toBe('Hello ? World');
  });
});
