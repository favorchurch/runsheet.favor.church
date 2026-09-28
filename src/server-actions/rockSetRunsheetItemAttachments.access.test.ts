import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { rockSetRunsheetItemAttachments } from './rockSetRunsheetItemAttachments';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockPost = jest.mocked(rockPost);

const attachment = {
  key: 'PreacherNotes/MNL/1042/9f3c/notes.pdf',
  name: 'notes.pdf',
  size: 10,
  uploadedAt: '2026-09-28T00:00:00.000Z',
};

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRockGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/ContentChannels/')) {
      return { Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 };
    }
    if (url.startsWith('/Attributes')) {
      return [{ Id: 555, Key: 'PREACHERNOTES' }];
    }
    return [];
  });
});

describe('rockSetRunsheetItemAttachments', () => {
  it('rejects a viewer and writes nothing', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(false);
    expect(mockRockPatch).not.toHaveBeenCalled();
    expect(mockRockPost).not.toHaveBeenCalled();
  });

  it('rejects an editor from another campus and writes nothing', async () => {
    mockGetRockSession.mockResolvedValue(session('BNE', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(false);
    expect(mockRockPatch).not.toHaveBeenCalled();
    expect(mockRockPost).not.toHaveBeenCalled();
  });

  it('creates the AttributeValue when none exists', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(true);
    expect(mockRockPost).toHaveBeenCalledWith('/AttributeValues', {
      AttributeId: 555,
      EntityId: 1042,
      Value: JSON.stringify([attachment]),
    });
  });

  it('patches the existing AttributeValue', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    mockRockGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/ContentChannels/')) {
        return { Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 };
      }
      if (url.startsWith('/Attributes')) return [{ Id: 555, Key: 'PREACHERNOTES' }];
      if (url.startsWith('/AttributeValues')) return [{ Id: 900, AttributeId: 555 }];
      return [];
    });

    await rockSetRunsheetItemAttachments({ channelId: 1, itemId: 1042, attachments: [] });

    expect(mockRockPatch).toHaveBeenCalledWith('/AttributeValues/900', { Value: '' });
  });

  it('rejects a malformed attachment list', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [{ key: '', name: '', size: -1, uploadedAt: '' }] as never,
    });

    expect(result.success).toBe(false);
    expect(mockRockPost).not.toHaveBeenCalled();
  });
});
