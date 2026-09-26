import { describe, expect, it } from '@jest/globals';
import { getRunsheetKind } from './runsheetKind';

describe('getRunsheetKind', () => {
  it('classifies by title', () => {
    expect(getRunsheetKind('MNL Grow - Bible Essentials // September 29, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL | Grow | Presence Filled Life // October 27, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL Youth // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL FY Service // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL Crowne // September 27, 2026 // 3PM')).toBe('sunday');
    expect(getRunsheetKind('MNL Family Night // September 30, 2026 // 7PM')).toBe('other');
  });

  it('does not treat "growth" as Grow', () => {
    expect(getRunsheetKind('MNL Growth Summit // September 30, 2026 // 7PM')).toBe('other');
  });
});
