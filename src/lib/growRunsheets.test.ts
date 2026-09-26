import { describe, expect, it } from '@jest/globals';
import {
  buildGrowRunsheetTitle,
  growOccurrenceKey,
  matchGrowRunsheet,
  nextGrowOccurrence,
  planMissingGrowRunsheets,
  type GrowSchedule,
} from './growRunsheets';

const wrap = (body: string) => `BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
const essentials: GrowSchedule = {
  id: 477,
  name: 'MNL Grow - Bible Essentials',
  iCalendarContent: wrap('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000'),
  effectiveEndDate: '2026-10-20T00:00:00',
};
const noMarker: GrowSchedule = {
  id: 900,
  name: 'Grow Leaders Huddle',
  iCalendarContent: wrap('DTSTART:20261003T083000'),
};

describe('buildGrowRunsheetTitle', () => {
  it('uses the schedule name, wordy date and time', () => {
    expect(buildGrowRunsheetTitle(essentials.name, '2026-09-29', '7PM')).toBe(
      'MNL Grow - Bible Essentials // September 29, 2026 // 7PM',
    );
  });

  it('prefixes MNL when the schedule name has no campus marker', () => {
    expect(buildGrowRunsheetTitle(noMarker.name, '2026-10-03', '8:30AM')).toBe(
      'MNL Grow Leaders Huddle // October 3, 2026 // 8:30AM',
    );
  });
});

describe('matchGrowRunsheet', () => {
  const schedules = [essentials, noMarker];

  it('matches a title to its schedule and date', () => {
    expect(matchGrowRunsheet('MNL Grow - Bible Essentials // October 6, 2026 // 7PM', schedules)).toEqual({
      scheduleId: 477,
      date: '2026-10-06',
    });
  });

  it('matches case-insensitively and with the MNL prefix added', () => {
    expect(matchGrowRunsheet('mnl grow leaders huddle // October 3, 2026 // 8:30AM', schedules)).toEqual({
      scheduleId: 900,
      date: '2026-10-03',
    });
  });

  it('rejects non-Grow titles and titles without a date', () => {
    expect(matchGrowRunsheet('MNL Crowne // September 27, 2026 // 3PM', schedules)).toBeNull();
    expect(matchGrowRunsheet('MNL Grow - Bible Essentials', schedules)).toBeNull();
  });

  it('fails closed when two schedules share a name', () => {
    expect(
      matchGrowRunsheet('MNL Grow - Bible Essentials // October 6, 2026 // 7PM', [essentials, { ...essentials, id: 478 }]),
    ).toBeNull();
  });
});

describe('nextGrowOccurrence', () => {
  it('returns the first occurrence on or after today', () => {
    expect(nextGrowOccurrence(essentials, '2026-10-01')).toEqual({ date: '2026-10-06', time: '7PM' });
    expect(nextGrowOccurrence(essentials, '2026-12-01')).toBeNull();
  });
});

describe('planMissingGrowRunsheets', () => {
  it('lists missing titles and skips existing ones', () => {
    const existing = ['MNL Grow - Bible Essentials // September 29, 2026 // 7PM'];
    expect(planMissingGrowRunsheets([essentials], existing, '2026-09-26')).toEqual([
      'MNL Grow - Bible Essentials // October 6, 2026 // 7PM',
      'MNL Grow - Bible Essentials // October 13, 2026 // 7PM',
    ]);
  });

  it('treats an existing title with a different time as already present', () => {
    const existing = ['MNL Grow - Bible Essentials // October 6, 2026 // 7:30PM'];
    expect(planMissingGrowRunsheets([essentials], existing, '2026-10-01')).toEqual([
      'MNL Grow - Bible Essentials // October 13, 2026 // 7PM',
    ]);
  });

  it('creates nothing on a second run', () => {
    const first = planMissingGrowRunsheets([essentials], [], '2026-09-26');
    expect(planMissingGrowRunsheets([essentials], first, '2026-09-26')).toEqual([]);
  });

  it('respects the cap', () => {
    expect(planMissingGrowRunsheets([essentials], [], '2026-09-26', 1)).toHaveLength(1);
  });
});

describe('growOccurrenceKey', () => {
  it('joins schedule id and date', () => {
    expect(growOccurrenceKey(477, '2026-09-29')).toBe('477:2026-09-29');
  });
});
