import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('@/server-actions/rockGetRunsheetDetails');

describe('rockGetRunsheetDetailsBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads every channel in parallel and tags each result with its channelId', async () => {
    (rockGetRunsheetDetails as jest.Mock).mockImplementation(async (id: number) => ({
      success: true,
      data: { channelId: id, name: `Channel ${id}`, contentChannelTypeId: 13, columns: [], items: [] },
    }));

    const results = await rockGetRunsheetDetailsBatch([1, 2, 3]);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.channelId).sort()).toEqual([1, 2, 3]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('reports a per-channel failure without failing the whole batch', async () => {
    (rockGetRunsheetDetails as jest.Mock).mockImplementation(async (id: number) => {
      if (id === 2) return { success: false, error: 'not found' };
      return { success: true, data: { channelId: id, name: `Channel ${id}`, contentChannelTypeId: 13, columns: [], items: [] } };
    });

    const results = await rockGetRunsheetDetailsBatch([1, 2]);

    const failed = results.find((r) => r.channelId === 2);
    expect(failed?.success).toBe(false);
    expect(failed?.error).toBe('not found');
    const ok = results.find((r) => r.channelId === 1);
    expect(ok?.success).toBe(true);
  });
});
