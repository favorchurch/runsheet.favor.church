import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from './rockBulkSaveRunsheetItems';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockDelete = jest.mocked(rockDelete);

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function expectNoRockWrites() {
  expect(mockRockPost).not.toHaveBeenCalled();
  expect(mockRockPatch).not.toHaveBeenCalled();
  expect(mockRockDelete).not.toHaveBeenCalled();
}

const existingItem = {
  id: 7,
  title: 'Existing segment',
  order: 1,
  duration: 1,
  attributeValues: {},
};

const newItem = {
  id: 'new-segment',
  isNew: true,
  title: 'New segment',
  order: 2,
  duration: 1,
  attributeValues: {},
};

function channelReads(channelName: string, items: Array<{ Id: number }> = [{ Id: 7 }]) {
  return async (url: string) => {
    if (url.startsWith('/ContentChannels/')) {
      return { Name: channelName, ContentChannelTypeId: 13, ItemsManuallyOrdered: false };
    }
    if (url === '/ContentChannelItems') return items;
    return [];
  };
}

describe('rockBulkSaveRunsheetItems access ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRockGet.mockResolvedValue([]);
    mockRockPost.mockResolvedValue(123);
    mockRockPatch.mockResolvedValue(null);
    mockRockDelete.mockResolvedValue(null);
  });

  it.each([
    ['viewer', session('MNL', false), 'MNL Service // August 16, 2026 // 10AM'],
    ['cross-campus editor', session('MNL', true), 'BNE Service // August 16, 2026 // 10AM'],
  ])('rejects a %s before any Rock write', async (_label, principal, channelName) => {
    mockGetRockSession.mockResolvedValue(principal);
    mockRockGet.mockImplementation(channelReads(channelName));

    const result = await rockBulkSaveRunsheetItems(42, [existingItem, newItem], [7], [], 'subtitle', '10AM');

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('accepts an editor on the channel campus after resolving the channel', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(channelReads('MNL Service // August 16, 2026 // 10AM'));

    const result = await rockBulkSaveRunsheetItems(42, [existingItem, newItem], [7], [], 'subtitle', '10AM');

    expect(result.success).toBe(true);
    expect(mockRockPatch).toHaveBeenCalledWith('/ContentChannels/42', { ItemsManuallyOrdered: true });
  });

  it('accepts a client-side string deletion id while deleting legitimate numeric rows', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(channelReads('MNL Service // August 16, 2026 // 10AM'));

    const result = await rockBulkSaveRunsheetItems(42, [existingItem], [7, 'new-segment']);

    expect(result.success).toBe(true);
    expect(mockRockDelete).toHaveBeenCalledTimes(1);
    expect(mockRockDelete).toHaveBeenCalledWith('/ContentChannelItems/7');
  });

  it('rejects item ids from another channel before any Rock write', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(channelReads('MNL Service // August 16, 2026 // 10AM', [{ Id: 8 }]));

    const result = await rockBulkSaveRunsheetItems(42, [existingItem], [8]);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('rejects a foreign deleted item id without calling rockDelete', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(channelReads('MNL Service // August 16, 2026 // 10AM', [{ Id: 7 }]));

    const result = await rockBulkSaveRunsheetItems(42, [existingItem], [8]);

    expect(result.success).toBe(false);
    expect(mockRockDelete).not.toHaveBeenCalled();
    expectNoRockWrites();
  });
});
