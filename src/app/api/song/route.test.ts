import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { GET } from './route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const viewer = {
  rolesMap: { viewer: ['7001'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

describe('song route access and id handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewer);
    mockRockGet.mockResolvedValue([]);
  });

  it('rejects a non-positive or non-integer id before touching Rock', async () => {
    const response = await GET(new Request('https://runsheet.test/api/song?id=0'));

    expect(response.status).toBe(400);
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('uses a constrained ContentChannelItems query for a valid id', async () => {
    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(404);
    expect(mockRockGet).toHaveBeenCalledWith('/ContentChannelItems', {
      $filter: 'ContentChannelId eq 18 and Id eq 42',
      $top: 1,
    });
  });

  it('denies authenticated users without runsheet access', async () => {
    mockGetRockSession.mockResolvedValue({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);

    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(403);
    expect(mockRockGet).not.toHaveBeenCalled();
  });
});
