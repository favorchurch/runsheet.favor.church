import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import {
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
  setPreacherNotesAttributeValue,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { rockGetPreacherNotes, rockUnlinkPreacherNote } from './rockPreacherNotes';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockPreacherNotesAttribute', () => ({
  getPreacherNotesAttributeValue: jest.fn(),
  setPreacherNotesAttributeValue: jest.fn(),
  mutatePreacherNotesAttribute: jest.fn(async (chId: number, mutate: any) => {
    const { getPreacherNotesAttributeValue, setPreacherNotesAttributeValue } =
      jest.requireMock('@/server-actions/internal/rockPreacherNotesAttribute') as any;
    const current = await getPreacherNotesAttributeValue(chId);
    const updated = await mutate(current);
    return setPreacherNotesAttributeValue(chId, updated);
  }),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);
const mockRockPatch = jest.mocked(rockPatch);
const mockGetAttributeValue = jest.mocked(getPreacherNotesAttributeValue);
const mockSetAttributeValue = jest.mocked(setPreacherNotesAttributeValue);
const mockMutateAttribute = jest.mocked(mutatePreacherNotesAttribute);

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function expectNoRockAttributeCalls() {
  expect(mockMutateAttribute).not.toHaveBeenCalled();
  expect(mockGetAttributeValue).not.toHaveBeenCalled();
  expect(mockSetAttributeValue).not.toHaveBeenCalled();
  expect(mockRockPost).not.toHaveBeenCalled();
  expect(mockRockPatch).not.toHaveBeenCalled();
}

describe('rockPreacherNotes server actions access control', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRockGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/ContentChannels/')) {
        return { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 };
      }
      return [];
    });
  });

  describe('rockGetPreacherNotes (list)', () => {
    it('denies a non-editor (viewer) before making any Rock attribute calls', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', false));

      const result = await rockGetPreacherNotes(42);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only runsheet editors');
      expectNoRockAttributeCalls();
    });

    it('denies an editor of another campus before making any Rock attribute calls', async () => {
      mockGetRockSession.mockResolvedValue(session('BNE', true));
      // Channel is MNL, caller is BNE editor
      mockRockGet.mockImplementation(async (url: string) => {
        if (url.startsWith('/ContentChannels/')) {
          return { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 };
        }
        return [];
      });

      const result = await rockGetPreacherNotes(42);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized for this runsheet campus');
      expectNoRockAttributeCalls();
    });

    it('allows an authorized editor to retrieve notes', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      mockGetAttributeValue.mockResolvedValueOnce([
        { name: 'Sermon.pdf', path: 'PreacherNotes/MNL/42/deadbeef/sermon.pdf' },
      ]);

      const result = await rockGetPreacherNotes(42);

      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(1);
      expect(mockGetAttributeValue).toHaveBeenCalledWith(42);
    });
  });

  describe('rockUnlinkPreacherNote (unlink)', () => {
    const targetPath = 'PreacherNotes/MNL/42/deadbeef/sermon.pdf';

    it('denies a non-editor (viewer) before making any Rock attribute calls', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', false));

      const result = await rockUnlinkPreacherNote(42, targetPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only runsheet editors');
      expectNoRockAttributeCalls();
    });

    it('denies an editor of another campus before making any Rock attribute calls', async () => {
      mockGetRockSession.mockResolvedValue(session('BNE', true));
      mockRockGet.mockImplementation(async (url: string) => {
        if (url.startsWith('/ContentChannels/')) {
          return { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 };
        }
        return [];
      });

      const result = await rockUnlinkPreacherNote(42, targetPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized for this runsheet campus');
      expectNoRockAttributeCalls();
    });

    it('removes only the unlinked note entry for an authorized editor', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const existing = [
        { name: 'Keep.pdf', path: 'PreacherNotes/MNL/42/1111/keep.pdf' },
        { name: 'Remove.pdf', path: targetPath },
      ];
      mockGetAttributeValue.mockResolvedValueOnce(existing);
      mockSetAttributeValue.mockImplementation(async (_chId, notes) => notes as any);

      const result = await rockUnlinkPreacherNote(42, targetPath);

      expect(result.success).toBe(true);
      expect(result.notes).toEqual([{ name: 'Keep.pdf', path: 'PreacherNotes/MNL/42/1111/keep.pdf' }]);
      expect(mockSetAttributeValue).toHaveBeenCalledWith(42, [
        { name: 'Keep.pdf', path: 'PreacherNotes/MNL/42/1111/keep.pdf' },
      ]);
    });
  });
});
