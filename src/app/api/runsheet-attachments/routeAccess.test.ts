import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { deleteAsset, fetchAsset, uploadAsset } from '@/server-actions/internal/rockAssetStorage';
import { POST } from './upload/route';
import { DELETE, GET } from './file/route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/server-actions/internal/rockAssetStorage', () => ({
  uploadAsset: jest.fn(),
  fetchAsset: jest.fn(),
  deleteAsset: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockUploadAsset = jest.mocked(uploadAsset);
const mockFetchAsset = jest.mocked(fetchAsset);
const mockDeleteAsset = jest.mocked(deleteAsset);

const KEY = 'PreacherNotes/MNL/1042/9f3c/notes.pdf';

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function pdfForm(bytes = '%PDF-1.4 hello') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'notes.pdf');
  form.append('channelId', '1');
  form.append('itemId', '1042');
  return form;
}

function uploadRequest(form: FormData) {
  return new Request('http://localhost/api/runsheet-attachments/upload', { method: 'POST', body: form });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRockGet.mockResolvedValue({ Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 } as never);
  mockFetchAsset.mockResolvedValue({ body: null, contentLength: '4' } as never);
  mockDeleteAsset.mockResolvedValue(true as never);
});

describe('attachment routes reject non-editors', () => {
  it('403s a viewer on upload and never touches Rock storage', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('403s a viewer on read', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await GET(
      new Request(`http://localhost/api/runsheet-attachments/file?channelId=1&key=${encodeURIComponent(KEY)}`),
    );
    expect(response.status).toBe(403);
    expect(mockFetchAsset).not.toHaveBeenCalled();
  });

  it('403s a viewer on delete', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await DELETE(
      new Request(`http://localhost/api/runsheet-attachments/file?channelId=1&key=${encodeURIComponent(KEY)}`, {
        method: 'DELETE',
      }),
    );
    expect(response.status).toBe(403);
    expect(mockDeleteAsset).not.toHaveBeenCalled();
  });

  it('403s an editor from another campus', async () => {
    mockGetRockSession.mockResolvedValue(session('BNE', true) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });
});

describe('upload validation', () => {
  it('rejects a file whose bytes are not a PDF', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await POST(uploadRequest(pdfForm('GIF89a not really a pdf')));
    expect(response.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('accepts a real PDF and returns its entry', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.key).toMatch(/^PreacherNotes\/MNL\/1042\//);
    expect(body.name).toBe('notes.pdf');
    expect(mockUploadAsset).toHaveBeenCalled();
  });
});

describe('key validation', () => {
  it('rejects a key outside the PreacherNotes tree', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await GET(
      new Request('http://localhost/api/runsheet-attachments/file?channelId=1&key=web.config'),
    );
    expect(response.status).toBe(400);
    expect(mockFetchAsset).not.toHaveBeenCalled();
  });
});
