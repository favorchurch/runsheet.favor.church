import { describe, expect, it } from '@jest/globals';
import { partitionRunsheetChannelsByRecency, sortRunsheetChannels } from './runsheetDate';

const CHANNELS = [
  { id: 1, name: 'MNL Crowne // September 20, 2026 // 3PM' },
  { id: 2, name: 'MNL Crowne // September 27, 2026 // 3PM' },
  { id: 3, name: 'MNL Crowne // October 4, 2026 // 3PM' },
];

describe('sortRunsheetChannels', () => {
  it('still sorts ascending by default', () => {
    expect(sortRunsheetChannels(CHANNELS).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('sorts descending when asked', () => {
    expect(sortRunsheetChannels(CHANNELS, 'desc').map((c) => c.id)).toEqual([3, 2, 1]);
  });
});

describe('partitionRunsheetChannelsByRecency', () => {
  it('splits on today, counting today as upcoming', () => {
    const { upcoming, past } = partitionRunsheetChannelsByRecency(
      CHANNELS,
      new Date(2026, 8, 27), // September 27, 2026
    );
    expect(upcoming.map((c) => c.id)).toEqual([2, 3]);
    expect(past.map((c) => c.id)).toEqual([1]);
  });

  it('treats an undated channel as upcoming rather than hiding it at the bottom', () => {
    const { upcoming } = partitionRunsheetChannelsByRecency(
      [{ id: 9, name: 'Master Template' }],
      new Date(2026, 8, 27),
    );
    expect(upcoming.map((c) => c.id)).toEqual([9]);
  });
});
