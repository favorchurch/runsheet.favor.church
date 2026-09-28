/**
 * The runsheet's date is what binds it to a Rock service occurrence, so a
 * one-day drift silently detaches the Event Team Roster: the sheet asks Rock
 * about a Saturday no service exists on and gets nothing back.
 *
 * Favor runs on `Asia/Manila` (UTC+8), where `toISOString()` reports the
 * previous day for any local time before 08:00.
 */
import { describe, expect, it } from '@jest/globals';
import {
  formatDateToWordy,
  getNextSunday,
  toLocalIsoDate,
} from '@/components/runsheet/CreateRunsheetForm';

describe('toLocalIsoDate', () => {
  it('reads the date in local time, not UTC', () => {
    // 02:00 Manila is still the previous day in UTC.
    expect(toLocalIsoDate(new Date('2026-10-04T02:00:00+08:00'))).toBe('2026-10-04');
  });
});

describe('getNextSunday', () => {
  it('returns a Sunday whatever time of day the runsheet is created', () => {
    const earlyMorning = new Date('2026-09-29T06:30:00+08:00');
    const afternoon = new Date('2026-09-29T14:00:00+08:00');

    // Both must land on Sunday 2026-10-04. Before this fix the 06:30 case
    // produced 2026-10-03 — a Saturday — because toISOString() rolled it back.
    expect(getNextSunday(earlyMorning)).toBe('2026-10-04');
    expect(getNextSunday(afternoon)).toBe('2026-10-04');
  });

  it('never returns a day that is not a Sunday, at any hour', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const created = new Date(`2026-09-29T${String(hour).padStart(2, '0')}:00:00+08:00`);
      const next = getNextSunday(created);
      expect(new Date(`${next}T00:00:00`).getDay()).toBe(0);
    }
  });

  it('skips to the following Sunday when today is already Sunday', () => {
    expect(getNextSunday(new Date('2026-09-27T10:00:00+08:00'))).toBe('2026-10-04');
  });
});

describe('formatDateToWordy', () => {
  it('names the same calendar day it was given', () => {
    expect(formatDateToWordy('2026-10-04')).toBe('October 4, 2026');
    expect(formatDateToWordy('2026-01-01')).toBe('January 1, 2026');
  });
});
