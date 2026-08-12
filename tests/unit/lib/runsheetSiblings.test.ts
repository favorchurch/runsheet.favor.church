import { resolveSiblings } from '@/lib/runsheetSiblings';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

function channel(id: number, name: string): RunsheetChannelOption {
  return { id, name, time: name.split('//').pop()!.trim() };
}

describe('resolveSiblings', () => {
  const all: RunsheetChannelOption[] = [
    channel(1, 'MNL Crowne // August 16, 2026 // 9AM'),
    channel(2, 'MNL Crowne // August 16, 2026 // 11:30AM'),
    channel(3, 'MNL Crowne // August 16, 2026 // 5PM'),
    channel(4, 'BNE Chapel // August 16, 2026 // 10AM'),
    channel(5, 'MNL Crowne // August 23, 2026 // 9AM'),
  ];

  it('returns same-campus, same-date channels other than the source, all preselected', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.map((s) => s.channelId).sort()).toEqual([2, 3]);
    expect(result.every((s) => s.preselected)).toBe(true);
  });

  it('excludes a different campus on the same date', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.some((s) => s.channelId === 4)).toBe(false);
  });

  it('excludes the same campus on a different date', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.some((s) => s.channelId === 5)).toBe(false);
  });

  it('returns an empty array for a malformed source name', () => {
    const result = resolveSiblings(1, 'not a runsheet name', all);
    expect(result).toEqual([]);
  });

  it('excludes the source channel itself even if it matches its own campus/date', () => {
    const result = resolveSiblings(2, all[1].name, all);
    expect(result.some((s) => s.channelId === 2)).toBe(false);
  });
});
