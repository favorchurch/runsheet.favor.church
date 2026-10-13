import { describe, expect, it } from '@jest/globals';
import { matchRockSchedule, parseChannelOccurrence } from './rockServiceSchedule';

const SERVICES = [
  { scheduleId: 27, name: 'MNL Crowne 10AM' },
  { scheduleId: 35, name: 'MNL Family Night' },
  { scheduleId: 491, name: 'MNL Podium 5:30PM' },
  { scheduleId: 565, name: 'MNL Crowne 3PM' },
  { scheduleId: 666, name: 'MNL Filoil 3PM' },
];

describe('parseChannelOccurrence', () => {
  it('splits a channel name into date, prefix and time signature', () => {
    expect(parseChannelOccurrence('MNL Crowne // September 27, 2026 // 3PM')).toEqual({
      isoDate: '2026-09-27',
      prefix: 'MNL Crowne',
      timeSignature: '15:00:00',
    });
  });

  it('returns null for a non-MNL channel', () => {
    expect(parseChannelOccurrence('BNE Service // September 27, 2026 // 10AM')).toBeNull();
  });

  it('returns null when the date cannot be parsed', () => {
    expect(parseChannelOccurrence('MNL Crowne // sometime // 3PM')).toBeNull();
  });
});

describe('matchRockSchedule', () => {
  it('matches on venue prefix plus time signature', () => {
    expect(matchRockSchedule('MNL Crowne // September 27, 2026 // 3PM', SERVICES)).toEqual({
      scheduleId: 565,
      isoDate: '2026-09-27',
    });
  });

  it('tolerates a different but equivalent time spelling', () => {
    expect(matchRockSchedule('MNL Podium // September 27, 2026 // 5:30 PM', SERVICES)?.scheduleId).toBe(491);
  });

  it('matches a time-less schedule by full prefix', () => {
    expect(matchRockSchedule('MNL Family Night // September 30, 2026 // 7PM', SERVICES)).toEqual({
      scheduleId: 35,
      isoDate: '2026-09-30',
    });
  });

  it('returns null when nothing matches', () => {
    expect(matchRockSchedule('MNL Shang // September 27, 2026 // 3PM', SERVICES)).toBeNull();
  });

  it('returns null when two schedules match ambiguously', () => {
    const ambiguous = [
      { scheduleId: 1, name: 'MNL Crowne 3PM' },
      { scheduleId: 2, name: 'MNL Crowne 3:00PM' },
    ];
    expect(matchRockSchedule('MNL Crowne // September 27, 2026 // 3PM', ambiguous)).toBeNull();
  });

  it('returns null for a non-MNL channel even when a name would match', () => {
    expect(matchRockSchedule('BNE Crowne // September 27, 2026 // 3PM', SERVICES)).toBeNull();
  });
});

describe('matchRockSchedule schedule-name parsing', () => {
  const CHANNEL = 'MNL Crowne // September 27, 2026 // 3PM';
  const only = (name: string) => matchRockSchedule(CHANNEL, [{ scheduleId: 1, name }])?.scheduleId ?? null;

  it.each(['MNL Crowne - 3PM', 'MNL Crowne | 3PM', 'MNL Crowne 3 PM', 'mnl crowne 3:00pm', '  MNL Crowne 3PM  '])(
    'reads %p as the 3PM Crowne service',
    (name) => {
      expect(only(name)).toBe(1);
    },
  );

  it('requires the time to end the schedule name', () => {
    expect(only('MNL Crowne 3PM Overflow')).toBeNull();
  });

  it('requires a separator before the time', () => {
    expect(only('MNL Crowne3PM')).toBeNull();
  });

  it('reads two-digit hours', () => {
    expect(
      matchRockSchedule('MNL Podium // September 27, 2026 // 11:30AM', [{ scheduleId: 7, name: 'MNL Podium 11:30AM' }])
        ?.scheduleId,
    ).toBe(7);
  });

  it('does not match a different time at the same venue', () => {
    expect(only('MNL Crowne 10AM')).toBeNull();
  });
});

describe('matchRockSchedule channel normalisation', () => {
  it('ignores case and punctuation in the venue prefix', () => {
    expect(matchRockSchedule('mnl-crowne // September 27, 2026 // 3PM', SERVICES)?.scheduleId).toBe(565);
  });

  it('collapses runs of punctuation and ignores trailing punctuation in the venue prefix', () => {
    expect(matchRockSchedule('MNL -- Crowne! // September 27, 2026 // 3PM', SERVICES)?.scheduleId).toBe(565);
  });

  it('zero-pads the occurrence month and day', () => {
    expect(matchRockSchedule('MNL Crowne // January 4, 2026 // 3PM', SERVICES)?.isoDate).toBe('2026-01-04');
  });

  it('matches a time-less channel only to a time-less schedule with the same name', () => {
    expect(matchRockSchedule('MNL Family Night // September 30, 2026', SERVICES)?.scheduleId).toBe(35);
    expect(matchRockSchedule('MNL Crowne // September 30, 2026', SERVICES)).toBeNull();
  });
});
