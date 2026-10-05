import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  fetchRockContent,
  fetchRockContentStream,
  getRockRootUrl,
  uploadRockContent,
} from './rockContentUpload';
import { ROCK_API_KEY, ROCK_API_URL } from '@/constants/server';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).fetch = mockFetch;
});

describe('rockContentUpload', () => {
  describe('getRockRootUrl', () => {
    it('strips /api and trailing slashes from ROCK_API_URL', () => {
      const root = getRockRootUrl();
      expect(root).not.toMatch(/\/api\/?$/);
      expect(ROCK_API_URL).toContain('/api');
      expect(root).toBe(ROCK_API_URL.replace(/\/api\/?$/, ''));
    });
  });

  describe('uploadRockContent', () => {
    it('posts multipart with FolderPath and file, Authorization-Token, and returns FileName', async () => {
      const returnedFileName = 'PreacherNotes/MNL/42/deadbeef/notes.pdf';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ FileName: returnedFileName }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const buffer = Buffer.from('%PDF-1.4 test');
      const folder = 'PreacherNotes/MNL/42/deadbeef/';
      const result = await uploadRockContent(folder, buffer, 'notes.pdf');

      expect(result).toBe(returnedFileName);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${getRockRootUrl()}/FileUploader.ashx`);
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization-Token']).toBe(ROCK_API_KEY);

      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('FolderPath')).toBe(folder);
      const fileEntry = body.get('file');
      expect(fileEntry).toBeTruthy();
    });

    it('throws sanitized error on non-2xx without leaking token or raw body', async () => {
      const secretToken = ROCK_API_KEY || 'super-secret-rock-token';
      const sensitiveRockBody = '<html>Internal Rock stack trace with database password and token</html>';

      mockFetch.mockResolvedValueOnce(
        new Response(sensitiveRockBody, {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      const buffer = Buffer.from('%PDF-1.4 test');
      await expect(
        uploadRockContent('PreacherNotes/MNL/42/deadbeef/', buffer, 'notes.pdf'),
      ).rejects.toThrow(/Rock upload failed with status 500: Internal Server Error/);

      try {
        await uploadRockContent('PreacherNotes/MNL/42/deadbeef/', buffer, 'notes.pdf');
      } catch (err: any) {
        expect(err.message).not.toContain(secretToken);
        expect(err.message).not.toContain('stack trace');
        expect(err.message).not.toContain('database password');
      }
    });

    it('throws when FileName is missing from Rock JSON response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ other: 'field' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const buffer = Buffer.from('%PDF-1.4 test');
      await expect(
        uploadRockContent('PreacherNotes/MNL/42/deadbeef/', buffer, 'notes.pdf'),
      ).rejects.toThrow(/missing FileName/);
    });
  });

  describe('fetchRockContent and fetchRockContentStream', () => {
    it('fetches {ROCK_ROOT}/Content/<encoded path> with encoded segments', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce(
        new Response(mockStream, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf', 'Content-Length': '1024' },
        }),
      );

      const rawPath = 'PreacherNotes/MNL/42/deadbeef/My Sermon Notes #1.pdf';
      const response = await fetchRockContent(rawPath);

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      const root = getRockRootUrl();
      expect(url).toBe(
        `${root}/Content/PreacherNotes/MNL/42/deadbeef/My%20Sermon%20Notes%20%231.pdf`,
      );
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>)['Authorization-Token']).toBe(ROCK_API_KEY);
    });

    it('returns body ReadableStream from fetchRockContentStream', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce(
        new Response(mockStream, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );

      const stream = await fetchRockContentStream('PreacherNotes/MNL/42/deadbeef/notes.pdf');
      expect(stream).toBeDefined();
    });

    it('throws sanitized error on non-2xx response during fetch', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Sensitive 404 details', {
          status: 404,
          statusText: 'Not Found',
        }),
      );

      await expect(
        fetchRockContent('PreacherNotes/MNL/42/deadbeef/missing.pdf'),
      ).rejects.toThrow(/Rock fetch failed with status 404: Not Found/);
    });
  });
});
