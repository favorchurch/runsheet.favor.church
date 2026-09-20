import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetSongDetails } from './rockGetSongDetails';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

describe('rockGetSongDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies access if session is unauthorized', async () => {
    mockGetRockSession.mockResolvedValueOnce(null as any);

    const res = await rockGetSongDetails({ songId: 123 });
    expect(res.success).toBe(false);
    expect(res.error).toBe('You do not have access to runsheets.');
    expect(res.song).toBeNull();
  });

  it('fetches and parses song details by ID', async () => {
    mockGetRockSession.mockResolvedValueOnce({
      rolesMap: { viewer: ['7001'] },
      access: { runsheetCampuses: ['MNL'] },
    } as any);

    mockRockGet.mockResolvedValueOnce([
      {
        Id: 123,
        Title: 'Way Maker',
        Content: `**Key:** E\n**Artist:** Sinach\n**BPM:** 68\n**CCLI:** 7115744\n---\n## Verse 1\nYou are here, moving in our midst\n## Chorus\nWay maker, miracle worker`,
      },
    ] as any);

    const res = await rockGetSongDetails({ songId: 123 });

    expect(res.success).toBe(true);
    expect(res.song).not.toBeNull();
    expect(res.song?.id).toBe(123);
    expect(res.song?.title).toBe('Way Maker');
    expect(res.song?.key).toBe('E');
    expect(res.song?.artist).toBe('Sinach');
    expect(res.song?.bpm).toBe('68');
    expect(res.song?.sections).toHaveLength(2);
  });

  it('fetches song details by Title fallback', async () => {
    mockGetRockSession.mockResolvedValueOnce({
      rolesMap: { viewer: ['7001'] },
      access: { runsheetCampuses: ['MNL'] },
    } as any);

    mockRockGet.mockResolvedValueOnce([
      {
        Id: 456,
        Title: 'Build My Life (Housefires)',
        Content: `**Key:** G\n**Artist:** Housefires`,
      },
    ] as any);

    const res = await rockGetSongDetails({ title: 'Build My Life' });

    expect(res.success).toBe(true);
    expect(res.song).not.toBeNull();
    expect(res.song?.id).toBe(456);
    expect(res.song?.cleanTitle).toBe('Build My Life');
  });
});
