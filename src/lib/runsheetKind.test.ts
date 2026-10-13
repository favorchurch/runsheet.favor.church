import { describe, expect, it } from '@jest/globals';
import { RUNSHEET_KIND_LABELS, RUNSHEET_KIND_ORDER, getRunsheetKind, isGrowRunsheetTitle } from './runsheetKind';

describe('getRunsheetKind', () => {
  it('classifies by title', () => {
    expect(getRunsheetKind('MNL Grow - Bible Essentials // September 29, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL | Grow | Presence Filled Life // October 27, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL Youth // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL FY Service // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL Crowne // September 27, 2026 // 3PM')).toBe('sunday');
    expect(getRunsheetKind('MNL Family Night // September 30, 2026 // 7PM')).toBe('other');
  });

  it('classifies Kids runsheets ahead of Sunday', () => {
    expect(getRunsheetKind('MNL Crowne - Kids // September 27, 2026 // 9AM')).toBe('kids');
    expect(getRunsheetKind('BNE Kids Service // September 27, 2026 // 10AM')).toBe('kids');
  });

  it('does not treat "growth" as Grow', () => {
    expect(getRunsheetKind('MNL Growth Summit // September 30, 2026 // 7PM')).toBe('other');
  });
});

describe('runsheet kind filter metadata', () => {
  it('lists every kind once, Sunday first and Other last, with a display label', () => {
    expect(RUNSHEET_KIND_ORDER).toEqual(['sunday', 'youth', 'kids', 'grow', 'other']);
    expect(RUNSHEET_KIND_ORDER.map((k) => RUNSHEET_KIND_LABELS[k])).toEqual([
      'Sunday',
      'Youth',
      'Kids',
      'Grow',
      'Other',
    ]);
  });
});

describe('isGrowRunsheetTitle', () => {
  it('is true only for Grow runsheets', () => {
    expect(isGrowRunsheetTitle('MNL Grow // September 29, 2026 // 7PM')).toBe(true);
    expect(isGrowRunsheetTitle('MNL Kids Grow Night // September 29, 2026 // 7PM')).toBe(true);
    expect(isGrowRunsheetTitle('MNL Crowne // September 27, 2026 // 3PM')).toBe(false);
  });
});

describe('getRunsheetKind edge cases', () => {
  it('does not treat a dated non-Sunday or undated runsheet as Sunday', () => {
    expect(getRunsheetKind('MNL Crowne // September 26, 2026 // 3PM')).toBe('other');
    expect(getRunsheetKind('Master Template')).toBe('other');
  });

  it('matches "fy" only as a whole word', () => {
    expect(getRunsheetKind('MNL Fyre Night // September 27, 2026 // 3PM')).toBe('sunday');
  });
});
