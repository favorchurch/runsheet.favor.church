import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { renderRunsheetPdf, RUNSHEET_ERROR_STATUS_MAP } from '@/lib/runsheetExport';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';
import { GET } from './route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/lib/runsheetExport', () => {
  const actual = jest.requireActual<typeof import('@/lib/runsheetExport')>('@/lib/runsheetExport');
  return { ...actual, renderRunsheetPdf: jest.fn(actual.renderRunsheetPdf) };
});

jest.mock('@/server-actions/runsheetAuthorization', () => ({
  assertRunsheetViewAccess: jest.fn(),
}));

jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({
  rockGetRunsheetDetails: jest.fn(),
}));

const mockRenderRunsheetPdf = jest.mocked(renderRunsheetPdf);
const mockGetRockSession = jest.mocked(getRockSession);
const mockAssertRunsheetViewAccess = jest.mocked(assertRunsheetViewAccess);
const mockRockGetRunsheetDetails = jest.mocked(rockGetRunsheetDetails);

function mockValidSession() {
  return {
    rolesMap: { viewer: ['7001'] },
    access: { runsheetCampuses: ['MNL'] },
  } as any;
}

describe('GET /api/runsheet-export/[channelId] access and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('channelId validation', () => {
    it.each([
      ['missing channelId', ''],
      ['non-numeric channelId', 'abc'],
      ['zero channelId', '0'],
      ['negative channelId', '-42'],
      ['floating point channelId', '42.5'],
    ])('rejects %s with 400 before checking session or rock', async (_label, channelIdVal) => {
      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/' + channelIdVal), {
        params: Promise.resolve({ channelId: channelIdVal }),
      });
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error).toBeDefined();

      expect(mockGetRockSession).not.toHaveBeenCalled();
      expect(mockAssertRunsheetViewAccess).not.toHaveBeenCalled();
      expect(mockRockGetRunsheetDetails).not.toHaveBeenCalled();
    });
  });

  describe('authentication gates', () => {
    it('returns 401 when getRockSession throws', async () => {
      mockGetRockSession.mockRejectedValue(new Error('Session error'));

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error).toMatch(/Unauthorized/i);

      expect(mockAssertRunsheetViewAccess).not.toHaveBeenCalled();
      expect(mockRockGetRunsheetDetails).not.toHaveBeenCalled();
    });

    it('returns 401 when getRockSession returns null', async () => {
      mockGetRockSession.mockResolvedValue(null as any);

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error).toMatch(/Unauthorized/i);

      expect(mockAssertRunsheetViewAccess).not.toHaveBeenCalled();
      expect(mockRockGetRunsheetDetails).not.toHaveBeenCalled();
    });
  });

  describe('view access authorization', () => {
    it('returns 403 when assertRunsheetViewAccess denies access', async () => {
      mockGetRockSession.mockResolvedValue(mockValidSession());
      mockAssertRunsheetViewAccess.mockReturnValue({
        allowed: false,
        error: 'You do not have access to runsheets.',
      });

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error).toBe('You do not have access to runsheets.');

      expect(mockRockGetRunsheetDetails).not.toHaveBeenCalled();
    });
  });

  describe('rockGetRunsheetDetails error mapping', () => {
    beforeEach(() => {
      mockGetRockSession.mockResolvedValue(mockValidSession());
      mockAssertRunsheetViewAccess.mockReturnValue({ allowed: true });
    });

    it.each(Object.entries(RUNSHEET_ERROR_STATUS_MAP))(
      'maps exact error "%s" to HTTP %i',
      async (errorString, expectedStatus) => {
        mockRockGetRunsheetDetails.mockResolvedValue({
          success: false,
          error: errorString,
        } as any);

        const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
          params: Promise.resolve({ channelId: '42' }),
        });
        expect(response.status).toBe(expectedStatus);

        const json = await response.json();
        expect(json.error).toBe(errorString);
      },
    );

    it.each([
      ['Failed to fetch runsheet details (e.g. deleted channel)'],
      ['Unexpected database timeout'],
      ['Network error communicating with Rock'],
    ])('maps unmapped failure "%s" to HTTP 500 with generic error and no PDF bytes', async (errorMsg) => {
      mockRockGetRunsheetDetails.mockResolvedValue({
        success: false,
        error: errorMsg,
      } as any);

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(500);

      const contentType = response.headers.get('Content-Type') || '';
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('application/pdf');

      const json = await response.json();
      expect(json.error).toBe('Failed to fetch runsheet details');
    });
  });

  describe('authorized export 200', () => {
    beforeEach(() => {
      mockGetRockSession.mockResolvedValue(mockValidSession());
      mockAssertRunsheetViewAccess.mockReturnValue({ allowed: true });
    });

    it('returns HTTP 200 with %PDF magic bytes and Content-Disposition attachment header', async () => {
      mockRockGetRunsheetDetails.mockResolvedValue({
        success: true,
        data: {
          channelId: 42,
          name: 'MNL Crowne // October 11, 2026 // 10AM',
          subtitle: 'Sunday Main Service',
          startTime: '09:00:00 AM',
          columns: [
            { id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
            { id: 2, key: 'DESCRIPTION', name: 'Detail' },
          ],
          items: [
            {
              id: 101,
              order: 1,
              title: 'Opening Prayer',
              duration: 5,
              attributeValues: {
                PLATFORM: 'Pastor John Doe',
                DESCRIPTION: 'Call congregation to worship',
              },
            },
          ],
          contentChannelTypeId: 13,
        },
      } as any);

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');

      expect(response.headers.get('Content-Disposition')).toBe(
        `attachment; filename="mnl-crowne-2026-10-11.pdf"; filename*=UTF-8''mnl-crowne-2026-10-11.pdf`,
      );
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');

      // Verify %PDF magic bytes
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.slice(0, 4).toString('utf-8')).toBe('%PDF');
    });

    it('returns 500 JSON with no PDF bytes when rendering throws', async () => {
      mockRenderRunsheetPdf.mockRejectedValueOnce(new Error('layout exploded: secret detail'));
      mockRockGetRunsheetDetails.mockResolvedValue({
        success: true,
        data: {
          channelId: 42,
          name: 'MNL Crowne // October 11, 2026 // 10AM',
          items: [],
          columns: [],
          contentChannelTypeId: 13,
        },
      } as any);

      const response = await GET(new Request('http://localhost:8000/api/runsheet-export/42'), {
        params: Promise.resolve({ channelId: '42' }),
      });
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(response.headers.get('Content-Disposition')).toBeNull();
      expect(await response.json()).toEqual({ error: 'Failed to generate PDF' });
    });
  });
});
