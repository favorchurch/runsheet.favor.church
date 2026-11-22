import { describe, expect, it } from '@jest/globals';
import {
  getRunsheetDateKey,
  getRunsheetTimeZone,
  getSegmentProgress,
  readCampusClock,
} from './runsheetLiveProgress';

describe('getRunsheetTimeZone', () => {
  it.each([
    ['MNL Crowne // November 22, 2026 // 10AM', 'Asia/Manila'],
    ['BNE // November 22, 2026 // 10AM', 'Australia/Brisbane'],
    ['SEL // November 22, 2026 // 10AM', 'Asia/Seoul'],
    ['Unlabelled // November 22, 2026', 'Asia/Manila'],
  ])('%s runs on %s', (name, zone) => {
    expect(getRunsheetTimeZone(name)).toBe(zone);
  });
});

describe('readCampusClock', () => {
  // 2026-11-22 01:30:30 UTC
  const now = new Date(Date.UTC(2026, 10, 22, 1, 30, 30));

  it('reads Manila time (UTC+8)', () => {
    const clock = readCampusClock(now, 'Asia/Manila');
    expect(clock.dateKey).toBe('2026-11-22');
    expect(clock.minutes).toBeCloseTo(9 * 60 + 30.5);
  });

  it('reads Brisbane time (UTC+10)', () => {
    expect(readCampusClock(now, 'Australia/Brisbane').minutes).toBeCloseTo(11 * 60 + 30.5);
  });

  it('rolls the date over at the campus midnight, not UTC', () => {
    const lateUtc = new Date(Date.UTC(2026, 10, 21, 17, 0, 0));
    expect(readCampusClock(lateUtc, 'Asia/Manila')).toEqual({ dateKey: '2026-11-22', minutes: 60 });
  });

  it('reports midnight as hour 0, not 24', () => {
    const midnight = new Date(Date.UTC(2026, 10, 21, 16, 0, 0));
    expect(readCampusClock(midnight, 'Asia/Manila').minutes).toBe(0);
  });
});

describe('getRunsheetDateKey', () => {
  it('reads the date in the runsheet name', () => {
    expect(getRunsheetDateKey('MNL Crowne // November 2, 2026 // 10AM')).toBe('2026-11-02');
  });

  it('is null for a name without a date', () => {
    expect(getRunsheetDateKey('MASTER TEMPLATE')).toBeNull();
  });
});

describe('getSegmentProgress', () => {
  const clock = { dateKey: '2026-11-22', minutes: 10 * 60 };

  it('is past once the planned end has passed', () => {
    expect(getSegmentProgress('2026-11-22', 9 * 60, 9 * 60 + 30, clock)).toBe('past');
  });

  it('is past exactly at the planned end', () => {
    expect(getSegmentProgress('2026-11-22', 9 * 60 + 30, 10 * 60, clock)).toBe('past');
  });

  it('is current from the planned start until the planned end', () => {
    expect(getSegmentProgress('2026-11-22', 10 * 60, 10 * 60 + 15, clock)).toBe('current');
    expect(getSegmentProgress('2026-11-22', 9 * 60 + 50, 10 * 60 + 15, clock)).toBe('current');
  });

  it('is upcoming before the planned start', () => {
    expect(getSegmentProgress('2026-11-22', 10 * 60 + 1, 10 * 60 + 15, clock)).toBe('upcoming');
  });

  it('treats a zero-length span as past once its start passes', () => {
    expect(getSegmentProgress('2026-11-22', 10 * 60, 10 * 60, clock)).toBe('past');
  });

  it('styles nothing on a runsheet for another day', () => {
    expect(getSegmentProgress('2026-11-21', 9 * 60, 9 * 60 + 30, clock)).toBeNull();
    expect(getSegmentProgress('2026-11-29', 9 * 60, 9 * 60 + 30, clock)).toBeNull();
  });

  it('styles nothing without a date or a clock', () => {
    expect(getSegmentProgress(null, 9 * 60, 9 * 60 + 30, clock)).toBeNull();
    expect(getSegmentProgress('2026-11-22', 9 * 60, 9 * 60 + 30, null)).toBeNull();
  });
});
