import { describe, expect, it } from '@jest/globals';
import { buildRosteredViewerKeys, channelRosterKey, rosterKey } from './rosterAccess';

describe('rosterKey', () => {
  it('joins campus, date and time signature', () => {
    expect(rosterKey('MNL', '2026-09-27', '15:00:00')).toBe('MNL:2026-09-27:15:00:00');
  });
});

describe('buildRosteredViewerKeys', () => {
  const grow = new Set([752]);

  it('builds keys from attendance campus and local start time', () => {
    expect(
      buildRosteredViewerKeys(
        [
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 311 },
          { campusId: 2, startDateTime: '2026-09-27T17:30:00', scheduleId: 400 },
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 311 },
        ],
        grow,
      ),
    ).toEqual(['MNL:2026-09-27:15:00:00', 'BNE:2026-09-27:17:30:00']);
  });

  it('skips Grow schedules, unknown campuses and malformed times', () => {
    expect(
      buildRosteredViewerKeys(
        [
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 752 },
          { campusId: 6, startDateTime: '2026-09-27T09:00:00', scheduleId: 311 },
          { campusId: null, startDateTime: '2026-09-27T09:00:00', scheduleId: 311 },
          { campusId: 1, startDateTime: 'not a date', scheduleId: 311 },
        ],
        grow,
      ),
    ).toEqual([]);
  });
});

describe('channelRosterKey', () => {
  it('derives the key from a service title', () => {
    expect(channelRosterKey('MNL Crowne // September 27, 2026 // 3PM')).toBe('MNL:2026-09-27:15:00:00');
    expect(channelRosterKey('BNE Chapel // September 27, 2026 // 5:30PM')).toBe('BNE:2026-09-27:17:30:00');
  });

  it('never keys a Grow title or an incomplete title', () => {
    expect(channelRosterKey('MNL Grow - Build x FDNA // September 27, 2026 // 3PM')).toBeNull();
    expect(channelRosterKey('MNL Crowne // September 27, 2026')).toBeNull();
    expect(channelRosterKey('Crowne // September 27, 2026 // 3PM')).toBeNull();
  });
});
