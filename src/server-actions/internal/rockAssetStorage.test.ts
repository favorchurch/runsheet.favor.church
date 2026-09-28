import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deleteAsset, fetchAsset, uploadAsset } from './rockAssetStorage';

const mockFetch = jest.fn<any>();

beforeEach(() => {
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
});

describe('uploadAsset', () => {
  it('posts multipart to the asset uploader with the API key and the key as a query param', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' } as any);

    await uploadAsset('PreacherNotes/MNL/1/a/notes.pdf', new Blob([new Uint8Array([1])]), 'notes.pdf');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/FileUploader.ashx');
    expect(url).toContain('StorageId=1');
    expect(url).toContain(encodeURIComponent('PreacherNotes/MNL/1/a/notes.pdf'));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization-Token']).toBeTruthy();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws when Rock rejects the upload', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 413, text: async () => 'too large' } as any);

    await expect(
      uploadAsset('PreacherNotes/MNL/1/a/notes.pdf', new Blob([new Uint8Array([1])]), 'notes.pdf'),
    ).rejects.toThrow('413');
  });
});

describe('fetchAsset', () => {
  it('returns the body and content length', async () => {
    const headers = new Map([['content-length', '42']]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'stream',
      headers: { get: (name: string) => headers.get(name) ?? null },
    } as any);

    const result = await fetchAsset('PreacherNotes/MNL/1/a/notes.pdf');

    expect(result.contentLength).toBe('42');
    expect(result.body).toBe('stream');
  });

  it('throws when the asset is missing', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' } as any);
    await expect(fetchAsset('PreacherNotes/MNL/1/a/gone.pdf')).rejects.toThrow('404');
  });
});

describe('deleteAsset', () => {
  it('reports true when Rock deletes the file', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' } as any);
    await expect(deleteAsset('PreacherNotes/MNL/1/a/notes.pdf')).resolves.toBe(true);
  });

  it('reports false instead of throwing when Rock has no delete endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'no route' } as any);
    await expect(deleteAsset('PreacherNotes/MNL/1/a/notes.pdf')).resolves.toBe(false);
  });
});
