import { describe, expect, it } from '@jest/globals';
import { buildRosteredViewerKeys, channelRosterKey, rosterKey, rosteredAttendanceFromOccurrence } from './rosterAccess';

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

describe('Kids roster keys', () => {
  it('prefixes Kids attendances so they never match a Sunday runsheet', () => {
    expect(
      buildRosteredViewerKeys(
        [
          { campusId: 1, startDateTime: '2026-09-27T09:00:00', scheduleId: 566 },
          { campusId: 1, startDateTime: '2026-09-27T09:00:00', scheduleId: 564 },
        ],
        new Set(),
        new Set([566]),
      ),
    ).toEqual(['kids:MNL:2026-09-27:09:00:00', 'MNL:2026-09-27:09:00:00']);
  });

  it('prefixes Kids runsheet titles the same way', () => {
    expect(channelRosterKey('MNL Crowne - Kids // September 27, 2026 // 9AM')).toBe('kids:MNL:2026-09-27:09:00:00');
    expect(channelRosterKey('MNL Crowne // September 27, 2026 // 9AM')).toBe('MNL:2026-09-27:09:00:00');
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

describe('rosteredAttendanceFromOccurrence', () => {
  // Live Rock, 2026-10-04: Bryan Opano checked in for MNL Crowne 9AM (schedule
  // 564) with MNL Worship Team (campus 1). Check-in rewrote his attendance to
  // StartDateTime 06:33:26 and CampusId null.
  const checkedIn = {
    attendanceCampusId: null,
    attendanceStartDateTime: '2026-10-04T06:33:26',
    occurrenceDate: '2026-10-04T00:00:00',
    scheduleId: 564,
    scheduleStartTime: '09:00:00',
    groupCampusId: 1,
  };

  it('rebuilds a checked-in attendance from its occurrence, schedule and team', () => {
    const attendance = rosteredAttendanceFromOccurrence(checkedIn);
    expect(attendance).toEqual({ campusId: 1, startDateTime: '2026-10-04T09:00:00', scheduleId: 564 });
    expect(buildRosteredViewerKeys([attendance], new Set())).toEqual([
      channelRosterKey('MNL Crowne // October 4, 2026 // 9AM'),
    ]);
  });

  it('falls back to the attendance row when the occurrence lacks a schedule or team campus', () => {
    expect(
      rosteredAttendanceFromOccurrence({
        attendanceCampusId: 1,
        attendanceStartDateTime: '2026-10-02T20:00:00',
        occurrenceDate: '2026-10-02T00:00:00',
        scheduleId: null,
        scheduleStartTime: null,
        groupCampusId: null,
      }),
    ).toEqual({ campusId: 1, startDateTime: '2026-10-02T20:00:00', scheduleId: null });
  });

  it('produces the same key for pre-check-in and post-check-in rows matching MNL Crowne // October 4, 2026 // 9AM', () => {
    const preCheckIn = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T09:00:00',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      scheduleStartTime: '09:00:00',
      groupCampusId: 1,
    });
    const postCheckIn = rosteredAttendanceFromOccurrence(checkedIn);

    const expectedKey = channelRosterKey('MNL Crowne // October 4, 2026 // 9AM');
    expect(expectedKey).toBe('MNL:2026-10-04:09:00:00');
    expect(buildRosteredViewerKeys([preCheckIn], new Set())).toEqual([expectedKey]);
    expect(buildRosteredViewerKeys([postCheckIn], new Set())).toEqual([expectedKey]);
  });

  it('keeps keys for both 9AM and 11:30AM when rostered for both and checked in to either or both', () => {
    const expectedKeys = [
      channelRosterKey('MNL Crowne // October 4, 2026 // 9AM'),
      channelRosterKey('MNL Crowne // October 4, 2026 // 11:30AM'),
    ];

    const slot9amCheckedIn = rosteredAttendanceFromOccurrence(checkedIn);
    const slot9amPre = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T09:00:00',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      scheduleStartTime: '09:00:00',
      groupCampusId: 1,
    });

    const slot1130amCheckedIn = rosteredAttendanceFromOccurrence({
      attendanceCampusId: null,
      attendanceStartDateTime: '2026-10-04T08:52:10',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 557,
      scheduleStartTime: '11:30:00',
      groupCampusId: 1,
    });
    const slot1130amPre = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T11:30:00',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 557,
      scheduleStartTime: '11:30:00',
      groupCampusId: 1,
    });

    // Checked in to 9AM, pre-check-in for 11:30AM
    expect(buildRosteredViewerKeys([slot9amCheckedIn, slot1130amPre], new Set())).toEqual(expectedKeys);
    // Pre-check-in for 9AM, checked in to 11:30AM
    expect(buildRosteredViewerKeys([slot9amPre, slot1130amCheckedIn], new Set())).toEqual(expectedKeys);
    // Checked in to both
    expect(buildRosteredViewerKeys([slot9amCheckedIn, slot1130amCheckedIn], new Set())).toEqual(expectedKeys);
  });

  it('yields no key when team and attendance campuses are both null, but keeps key when attendance campus is present', () => {
    // Team null + attendance null: no stable campus at all → no key granted
    const noCampus = rosteredAttendanceFromOccurrence({
      attendanceCampusId: null,
      attendanceStartDateTime: '2026-10-04T06:33:26',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      scheduleStartTime: '09:00:00',
      groupCampusId: null,
    });
    expect(noCampus.campusId).toBeNull();
    expect(buildRosteredViewerKeys([noCampus], new Set())).toEqual([]);

    // Team null + attendance campus 1: falls back to attendance campus as last resort
    const attendanceCampusFallback = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T09:00:00',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      scheduleStartTime: '09:00:00',
      groupCampusId: null,
    });
    expect(attendanceCampusFallback.campusId).toBe(1);
    expect(buildRosteredViewerKeys([attendanceCampusFallback], new Set())).toEqual([
      'MNL:2026-10-04:09:00:00',
    ]);
  });

  it('unit cases: resolves WeeklyTimeOfDay "09:00:00" when iCal is absent, and falls through to attendance row when null or malformed', () => {
    // iCal absent + WeeklyTimeOfDay '09:00:00' → 09:00:00
    const resolvedFromWeekly = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T06:33:26',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      weeklyTimeOfDay: '09:00:00',
      groupCampusId: 1,
    });
    expect(resolvedFromWeekly.startDateTime).toBe('2026-10-04T09:00:00');

    // iCal absent + WeeklyTimeOfDay null → falls through to attendance row
    const nullWeekly = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T06:33:26',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      weeklyTimeOfDay: null,
      groupCampusId: 1,
    });
    expect(nullWeekly.startDateTime).toBe('2026-10-04T06:33:26');

    // iCal absent + WeeklyTimeOfDay malformed → falls through to attendance row
    const malformedWeekly = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T06:33:26',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      weeklyTimeOfDay: 'invalid-time',
      groupCampusId: 1,
    });
    expect(malformedWeekly.startDateTime).toBe('2026-10-04T06:33:26');

    // Explicit scheduleStartTime null falls back to raw fields if present
    const explicitNullWithWeekly = rosteredAttendanceFromOccurrence({
      attendanceCampusId: 1,
      attendanceStartDateTime: '2026-10-04T06:33:26',
      occurrenceDate: '2026-10-04T00:00:00',
      scheduleId: 564,
      scheduleStartTime: null,
      weeklyTimeOfDay: '09:00:00',
      groupCampusId: 1,
    });
    expect(explicitNullWithWeekly.startDateTime).toBe('2026-10-04T09:00:00');
  });
});

