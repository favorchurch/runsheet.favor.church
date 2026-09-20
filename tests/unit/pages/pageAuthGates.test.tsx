import React from 'react';
import CreateRunsheetPage from '@/app/create/page';
import DirectRunsheetPage from '@/app/[channelId]/page';
import { requireServerSession } from '@/auth0-hooks/server/getServerSession';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    const error = new Error(`NEXT_REDIRECT: ${url}`);
    (error as any).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  }),
}));

jest.mock('@/auth0-hooks/server/getServerSession', () => ({
  requireServerSession: jest.fn(),
}));

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/components/runsheet/RunsheetManager', () => ({
  RunsheetManager: (props: any) => <div data-testid="runsheet-manager" data-props={JSON.stringify(props)} />,
}));

const mockRequireServerSession = jest.mocked(requireServerSession);
const mockGetRockSession = jest.mocked(getRockSession);
const mockRedirect = jest.mocked(redirect);

describe('Page Auth Gates', () => {
  const REDIRECT_SENTINEL = new Error('NEXT_REDIRECT: /api/auth/login?returnTo=%2F');

  const editorSession = {
    personId: 101,
    personIds: [101],
    contact: {
      id: 101,
      fullName: 'Editor User',
      email: 'editor@example.test',
    },
    rolesMap: {
      editor: ['1'],
      viewer: ['1'],
    },
    access: {
      runsheetCampuses: ['MNL'],
    },
  } as any;

  const viewerOnlySession = {
    personId: 102,
    personIds: [102],
    contact: {
      id: 102,
      fullName: 'Viewer User',
      email: 'viewer@example.test',
    },
    rolesMap: {
      viewer: ['1'],
    },
    access: {
      runsheetCampuses: ['MNL'],
    },
  } as any;

  const noAccessSession = {
    personId: 103,
    personIds: [103],
    contact: {
      id: 103,
      fullName: 'No Access User',
      email: 'noaccess@example.test',
    },
    rolesMap: {},
    access: {
      runsheetCampuses: [],
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      const error = new Error(`NEXT_REDIRECT: ${url}`);
      (error as any).digest = `NEXT_REDIRECT;replace;${url};307;`;
      throw error;
    });
  });

  describe('CreateRunsheetPage (/create)', () => {
    it('rejects with redirect sentinel when unauthenticated, and never calls getRockSession', async () => {
      mockRequireServerSession.mockImplementationOnce(() => {
        throw REDIRECT_SENTINEL;
      });
      mockGetRockSession.mockImplementationOnce(() => {
        throw new Error('FORBIDDEN');
      });

      await expect(CreateRunsheetPage()).rejects.toThrow(REDIRECT_SENTINEL);
      expect(mockRequireServerSession).toHaveBeenCalledTimes(1);
      expect(mockGetRockSession).not.toHaveBeenCalled();
    });

    it('calls requireServerSession before getRockSession when authenticated with editor access', async () => {
      mockRequireServerSession.mockResolvedValueOnce({ user: { sub: 'auth0|123' } } as any);
      mockGetRockSession.mockResolvedValueOnce(editorSession);

      const element = await CreateRunsheetPage();
      expect(mockRequireServerSession).toHaveBeenCalledTimes(1);
      expect(mockGetRockSession).toHaveBeenCalledTimes(1);

      const requireOrder = mockRequireServerSession.mock.invocationCallOrder[0];
      const getRockOrder = mockGetRockSession.mock.invocationCallOrder[0];
      expect(requireOrder).toBeLessThan(getRockOrder);

      expect(React.isValidElement(element)).toBe(true);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects to / when authenticated but user is viewer-only (cannot edit)', async () => {
      mockRequireServerSession.mockResolvedValueOnce({ user: { sub: 'auth0|123' } } as any);
      mockGetRockSession.mockResolvedValueOnce(viewerOnlySession);

      await expect(CreateRunsheetPage()).rejects.toThrow('NEXT_REDIRECT: /');
      expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('renders Access Restricted panel when authenticated but user has no runsheet access', async () => {
      mockRequireServerSession.mockResolvedValueOnce({ user: { sub: 'auth0|123' } } as any);
      mockGetRockSession.mockResolvedValueOnce(noAccessSession);

      const element = await CreateRunsheetPage();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(React.isValidElement(element)).toBe(true);
      // Access restricted JSX
      expect(JSON.stringify(element)).toContain('Access Restricted');
    });
  });

  describe('DirectRunsheetPage (/[channelId])', () => {
    const pageParams = { params: Promise.resolve({ channelId: '42' }) };

    it('rejects with redirect sentinel when unauthenticated, and never calls getRockSession', async () => {
      mockRequireServerSession.mockImplementationOnce(() => {
        throw REDIRECT_SENTINEL;
      });
      mockGetRockSession.mockImplementationOnce(() => {
        throw new Error('FORBIDDEN');
      });

      await expect(DirectRunsheetPage(pageParams)).rejects.toThrow(REDIRECT_SENTINEL);
      expect(mockRequireServerSession).toHaveBeenCalledTimes(1);
      expect(mockGetRockSession).not.toHaveBeenCalled();
    });

    it('calls requireServerSession before getRockSession when authenticated with access', async () => {
      mockRequireServerSession.mockResolvedValueOnce({ user: { sub: 'auth0|123' } } as any);
      mockGetRockSession.mockResolvedValueOnce(editorSession);

      const element = await DirectRunsheetPage(pageParams);
      expect(mockRequireServerSession).toHaveBeenCalledTimes(1);
      expect(mockGetRockSession).toHaveBeenCalledTimes(1);

      const requireOrder = mockRequireServerSession.mock.invocationCallOrder[0];
      const getRockOrder = mockGetRockSession.mock.invocationCallOrder[0];
      expect(requireOrder).toBeLessThan(getRockOrder);

      expect(React.isValidElement(element)).toBe(true);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('renders Access Restricted panel without login redirect when authenticated without runsheet access', async () => {
      mockRequireServerSession.mockResolvedValueOnce({ user: { sub: 'auth0|123' } } as any);
      mockGetRockSession.mockResolvedValueOnce(noAccessSession);

      const element = await DirectRunsheetPage(pageParams);
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(React.isValidElement(element)).toBe(true);
      expect(JSON.stringify(element)).toContain('Access Restricted');
    });
  });
});
