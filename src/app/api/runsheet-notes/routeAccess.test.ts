import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { PREACHER_NOTES_MAX_BYTES } from '@/lib/preacherNotes';
import { fetchRockContent, uploadRockContent } from '@/server-actions/internal/rockContentUpload';
import {
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
  setPreacherNotesAttributeValue,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { GET as getList } from './route';
import { POST as postUpload } from './upload/route';
import { GET as getFile } from './file/route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockContentUpload', () => ({
  fetchRockContent: jest.fn(),
  uploadRockContent: jest.fn(),
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
const mockUploadRockContent = jest.mocked(uploadRockContent);
const mockFetchRockContent = jest.mocked(fetchRockContent);
const mockGetAttributeValue = jest.mocked(getPreacherNotesAttributeValue);
const mockSetAttributeValue = jest.mocked(setPreacherNotesAttributeValue);
const mockMutateAttribute = jest.mocked(mutatePreacherNotesAttribute);

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function expectNoRockStorageOrAttributeCalls() {
  expect(mockUploadRockContent).not.toHaveBeenCalled();
  expect(mockFetchRockContent).not.toHaveBeenCalled();
  expect(mockGetAttributeValue).not.toHaveBeenCalled();
  expect(mockSetAttributeValue).not.toHaveBeenCalled();
  expect(mockMutateAttribute).not.toHaveBeenCalled();
}

function createPdfFile(name: string, content = '%PDF-1.4 sample content', type = 'application/pdf'): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

describe('runsheet-notes route handlers access and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRockGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/ContentChannels/')) {
        return { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 };
      }
      return [];
    });
    mockGetAttributeValue.mockResolvedValue([]);
  });

  describe('access denial (non-editor and cross-campus editor)', () => {
    const validPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';

    it.each([
      ['non-editor (viewer)', session('MNL', false)],
      ['cross-campus editor', session('BNE', true)],
    ])('denies %s on upload route before calling Rock storage or attributes', async (_label, s) => {
      mockGetRockSession.mockResolvedValue(s);

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(403);
      expectNoRockStorageOrAttributeCalls();
    });

    it.each([
      ['non-editor (viewer)', session('MNL', false)],
      ['cross-campus editor', session('BNE', true)],
    ])('denies %s on file route before calling Rock storage or attributes', async (_label, s) => {
      mockGetRockSession.mockResolvedValue(s);

      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(validPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(403);
      expectNoRockStorageOrAttributeCalls();
    });

    it.each([
      ['non-editor (viewer)', session('MNL', false)],
      ['cross-campus editor', session('BNE', true)],
    ])('denies %s on list route before calling Rock attributes', async (_label, s) => {
      mockGetRockSession.mockResolvedValue(s);

      const request = new Request('http://localhost:8000/api/runsheet-notes?channelId=42');
      const response = await getList(request);

      expect(response.status).toBe(403);
      expect(mockGetAttributeValue).not.toHaveBeenCalled();
    });
  });

  describe('unauthenticated caller (no Auth0 session)', () => {
    const validPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';

    beforeEach(() => {
      mockGetRockSession.mockRejectedValue(new Error('FORBIDDEN'));
    });

    it('denies unauthenticated caller on upload route with 401', async () => {
      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));
      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toMatch(/Authentication required|Unauthorized/i);
      expectNoRockStorageOrAttributeCalls();
    });

    it('denies unauthenticated caller on file route with 401', async () => {
      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(validPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toMatch(/Authentication required|Unauthorized/i);
      expectNoRockStorageOrAttributeCalls();
    });

    it('denies unauthenticated caller on list route with 401', async () => {
      const request = new Request('http://localhost:8000/api/runsheet-notes?channelId=42');
      const response = await getList(request);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toMatch(/Authentication required|Unauthorized/i);
      expect(mockGetAttributeValue).not.toHaveBeenCalled();
    });
  });

  describe('upload route validation and handling', () => {
    it('rejects upload when channelId is missing from query string with 400', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('Invalid channel id');
      expectNoRockStorageOrAttributeCalls();
    });

    it('rejects non-PDF MIME type with 400', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));

      const formData = new FormData();
      formData.append('file', createPdfFile('image.png', 'fake image bytes', 'image/png'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('Only PDF files');
      expect(mockUploadRockContent).not.toHaveBeenCalled();
    });

    it('rejects files exceeding PREACHER_NOTES_MAX_BYTES with 413', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));

      const largeBuffer = new Uint8Array(PREACHER_NOTES_MAX_BYTES + 10);
      largeBuffer.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      const largeFile = new File([largeBuffer], 'large.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', largeFile);

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(413);
      expect(mockUploadRockContent).not.toHaveBeenCalled();
    });

    it('rejects non-PDF magic bytes with 400', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));

      const formData = new FormData();
      formData.append('file', createPdfFile('corrupt.pdf', 'NOT_A_PDF_CONTENT', 'application/pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('magic bytes');
      expect(mockUploadRockContent).not.toHaveBeenCalled();
    });

    it('successfully uploads valid PDF, updates attribute list, and returns new list', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const returnedPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';
      mockUploadRockContent.mockResolvedValueOnce(returnedPath);
      mockGetAttributeValue.mockResolvedValueOnce([]);
      mockSetAttributeValue.mockImplementation(async (_chId, notes) => notes as any);

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.notes).toHaveLength(1);
      expect(json.notes[0].name).toBe('notes.pdf');
      expect(json.notes[0].path).toBe(returnedPath);

      expect(mockUploadRockContent).toHaveBeenCalledTimes(1);
      expect(mockSetAttributeValue).toHaveBeenCalledTimes(1);
    });

    it('derives safe storage filename while preserving original display name (e.g. Sermon..pdf)', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const returnedPath = 'PreacherNotes/MNL/42/deadbeef/Sermon.pdf';
      mockUploadRockContent.mockResolvedValueOnce(returnedPath);
      mockGetAttributeValue.mockResolvedValueOnce([]);
      mockSetAttributeValue.mockImplementation(async (_chId, notes) => notes as any);

      const formData = new FormData();
      formData.append('file', createPdfFile('Sermon..pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(200);

      // Verify sanitized storage filename passed to Rock
      expect(mockUploadRockContent).toHaveBeenCalledWith(
        expect.stringMatching(/^PreacherNotes\/MNL\/42\//),
        expect.anything(),
        'Sermon.pdf',
      );

      // Verify original display name preserved in saved note
      const json = await response.json();
      expect(json.notes[0].name).toBe('Sermon..pdf');
      expect(json.notes[0].path).toBe(returnedPath);
    });

    it('appends .pdf to storage filename if missing (e.g. notes)', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const returnedPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';
      mockUploadRockContent.mockResolvedValueOnce(returnedPath);
      mockGetAttributeValue.mockResolvedValueOnce([]);
      mockSetAttributeValue.mockImplementation(async (_chId, notes) => notes as any);

      const formData = new FormData();
      formData.append('file', createPdfFile('notes'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(200);

      expect(mockUploadRockContent).toHaveBeenCalledWith(
        expect.stringMatching(/^PreacherNotes\/MNL\/42\//),
        expect.anything(),
        'notes.pdf',
      );

      const json = await response.json();
      expect(json.notes[0].name).toBe('notes');
    });

    it('returns 500 and does not link note if returned path fails isValidNotePath', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      // Rock returned an invalid path (e.g. wrong channelId or invalid segment)
      mockUploadRockContent.mockResolvedValueOnce('PreacherNotes/MNL/99/invalid/notes.pdf');

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('The file reached Rock but was not linked to the runsheet.');
      expect(mockSetAttributeValue).not.toHaveBeenCalled();
    });

    it('returns 500 stating file reached Rock but was not linked if attribute read throws after upload', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      mockUploadRockContent.mockResolvedValueOnce('PreacherNotes/MNL/42/deadbeef/notes.pdf');
      mockGetAttributeValue.mockResolvedValueOnce([]); // pre-check before upload succeeds
      mockGetAttributeValue.mockRejectedValueOnce(new Error('Rock attribute read failed')); // read inside mutate throws after upload

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('The file reached Rock but was not linked to the runsheet.');
    });

    it('returns 500 stating file reached Rock but was not linked if attribute save throws', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      mockUploadRockContent.mockResolvedValueOnce('PreacherNotes/MNL/42/deadbeef/notes.pdf');
      mockGetAttributeValue.mockResolvedValueOnce([]);
      mockSetAttributeValue.mockRejectedValueOnce(new Error('Rock attribute write failed'));

      const formData = new FormData();
      formData.append('file', createPdfFile('notes.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('The file reached Rock but was not linked to the runsheet.');
    });

    it('rejects upload when runsheet already has 10 notes with 400 before sending to Rock', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const tenNotes = Array.from({ length: 10 }, (_, i) => ({
        name: `note_${i}.pdf`,
        path: `PreacherNotes/MNL/42/deadbeef${i}/note_${i}.pdf`,
      }));
      mockGetAttributeValue.mockResolvedValueOnce(tenNotes);

      const formData = new FormData();
      formData.append('file', createPdfFile('note_11.pdf'));

      const request = new Request('http://localhost:8000/api/runsheet-notes/upload?channelId=42', {
        method: 'POST',
        body: formData,
      });

      const response = await postUpload(request);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error).toBe('A runsheet can hold up to 10 Preacher Notes PDFs');
      expect(mockUploadRockContent).not.toHaveBeenCalled();
    });
  });

  describe('file route validation and streaming', () => {
    it('rejects invalid note path with 400', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));

      const request = new Request('http://localhost:8000/api/runsheet-notes/file?channelId=42&path=../etc/passwd.pdf');
      const response = await getFile(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('Invalid note path');
      expect(mockFetchRockContent).not.toHaveBeenCalled();
    });

    it('rejects path not in saved channel list with 404', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      mockGetAttributeValue.mockResolvedValueOnce([]); // empty saved list

      const validLookingPath = 'PreacherNotes/MNL/42/deadbeef/other.pdf';
      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(validLookingPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(404);
      expect(mockFetchRockContent).not.toHaveBeenCalled();
    });

    it('streams PDF from Rock with private cache control and safe filename disposition', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const targetPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';

      mockGetAttributeValue.mockResolvedValueOnce([
        { name: 'Sermon "Quote" Notes.pdf', path: targetPath },
      ]);

      const mockStream = new ReadableStream();
      mockFetchRockContent.mockResolvedValueOnce(
        new Response(mockStream, {
          status: 200,
          headers: { 'Content-Length': '2048' },
        }),
      );

      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Content-Disposition')).toBe(
        'inline; filename="Sermon _Quote_ Notes.pdf"; filename*=UTF-8\'\'Sermon%20%22Quote%22%20Notes.pdf',
      );
      expect(response.headers.get('Content-Length')).toBe('2048');
    });

    it('sets attachment disposition when download=true or download=1', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const targetPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';

      mockGetAttributeValue.mockResolvedValue([
        { name: 'notes.pdf', path: targetPath },
      ]);

      mockFetchRockContent.mockResolvedValue(
        new Response(new ReadableStream(), {
          status: 200,
        }),
      );

      const requestTrue = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}&download=true`);
      const responseTrue = await getFile(requestTrue);

      expect(responseTrue.status).toBe(200);
      expect(responseTrue.headers.get('Content-Disposition')).toBe(
        'attachment; filename="notes.pdf"; filename*=UTF-8\'\'notes.pdf',
      );

      const requestOne = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}&download=1`);
      const responseOne = await getFile(requestOne);

      expect(responseOne.status).toBe(200);
      expect(responseOne.headers.get('Content-Disposition')).toBe(
        'attachment; filename="notes.pdf"; filename*=UTF-8\'\'notes.pdf',
      );
    });

    it('sets X-Content-Type-Options: nosniff and omits Content-Length when response is encoded', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const targetPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';

      mockGetAttributeValue.mockResolvedValueOnce([
        { name: 'notes.pdf', path: targetPath },
      ]);

      mockFetchRockContent.mockResolvedValueOnce(
        new Response(new ReadableStream(), {
          status: 200,
          headers: {
            'Content-Length': '1024',
            'Content-Encoding': 'gzip',
          },
        }),
      );

      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Content-Length')).toBeNull();
    });

    it('handles non-Latin note filenames safely in Content-Disposition', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const targetPath = 'PreacherNotes/SEL/42/deadbeef/notes.pdf';
      const koreanName = '설교 노트.pdf';

      mockGetAttributeValue.mockResolvedValueOnce([
        { name: koreanName, path: targetPath },
      ]);

      mockFetchRockContent.mockResolvedValueOnce(
        new Response(new ReadableStream(), { status: 200 }),
      );

      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}`);
      const response = await getFile(request);

      expect(response.status).toBe(200);
      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('inline;');
      expect(disposition).toContain('filename="__ __.pdf"');
      expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(koreanName)}`);
      // Header value must be ASCII (ByteString)
      expect(/^[\x20-\x7E]+$/.test(disposition!)).toBe(true);
    });

    it('ensures Content-Disposition filename ends in .pdf when stored note name has no extension', async () => {
      mockGetRockSession.mockResolvedValue(session('MNL', true));
      const targetPath = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';
      mockGetAttributeValue.mockResolvedValueOnce([
        { name: 'Sermon Outline', path: targetPath },
      ]);
      mockFetchRockContent.mockResolvedValueOnce(
        new Response(new ReadableStream(), { status: 200 }),
      );

      const request = new Request(`http://localhost:8000/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(targetPath)}&download=true`);
      const response = await getFile(request);

      expect(response.status).toBe(200);
      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toBe('attachment; filename="Sermon Outline.pdf"; filename*=UTF-8\'\'Sermon%20Outline.pdf');
    });
  });
});
