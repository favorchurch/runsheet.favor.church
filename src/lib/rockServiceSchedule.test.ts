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
