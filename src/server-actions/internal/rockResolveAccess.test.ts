import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { rockResolveAccess } from './rockResolveAccess';
import { readRockObjectCache, writeRockObjectCache } from './rockObjectCache';

jest.mock('./rockObjectCache', () => ({
  readRockObjectCache: jest.fn(async () => ({ hit: false })),
  writeRockObjectCache: jest.fn(async () => undefined),
}));

const mockReadRockObjectCache = jest.mocked(readRockObjectCache);
const mockWriteRockObjectCache = jest.mocked(writeRockObjectCache);

function rockResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(value),
  } as Response;
}

function responseFor(path: string, url: URL): unknown {
  if (path === '/People') {
    return [{ Id: 101, FirstName: 'Test', LastName: 'Editor', Email: 'editor@example.com', PrimaryCampusId: 1 }];
  }
  if (path === '/GroupMembers') {
    expect(url.searchParams.get('$filter')).toContain('IsArchived eq false');
    return [
      { Id: 1, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' },
      { Id: 2, GroupId: 19109, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: '1' },
    ];
  }
  if (path === '/Groups' && url.searchParams.get('$filter') === 'GroupTypeId eq 1') {
    return [{ Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null }];
  }
  if (path === '/Groups' && url.searchParams.get('$filter') === 'GroupTypeId eq 23') {
    return [
      { Id: 57, GroupTypeId: 23, Name: 'MNL', ParentGroupId: null },
      { Id: 19109, GroupTypeId: 23, Name: 'MNL Events Team', ParentGroupId: 57 },
    ];
  }
  if (path === '/GroupTypeRoles') {
    return [{ Id: 19, IsLeader: false }];
  }
  return [];
}

describe('rockResolveAccess', () => {
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadRockObjectCache.mockResolvedValue({ hit: false });
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      return rockResponse(responseFor(url.pathname.replace(/^\/api/, ''), url));
    });
    global.fetch = mockFetch;
  });

  it('resolves GroupType 1 global roles and gives them all-campus scope', async () => {
    const result = await rockResolveAccess(101);
    expect(result.rolesMap.editor).toEqual(['32879']);
    expect(result.rolesMap.viewer).toEqual(['32879', '19109']);
    expect(result.access.runsheetCampuses).toEqual(['ALL', 'MNL']);
    expect(mockWriteRockObjectCache).toHaveBeenCalled();
  });

  it('returns denied access for a missing Rock person and zero memberships', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.replace(/^\/api/, '') === '/People') return rockResponse([]);
      return rockResponse([]);
    });

    const result = await rockResolveAccess(0);

    expect(result.contact.id).toBe(0);
    expect(result.rolesMap).toEqual({});
    expect(result.access.runsheetCampuses).toEqual([]);
  });

  it('returns denied access for a Rock person with zero active memberships', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') {
        return rockResponse([{ Id: 202, FirstName: 'No', LastName: 'Memberships', PrimaryCampusId: 1 }]);
      }
      if (path === '/GroupMembers') return rockResponse([]);
      return rockResponse([]);
    });

    const result = await rockResolveAccess(202);

    expect(result.contact.id).toBe(202);
    expect(result.rolesMap).toEqual({});
    expect(result.access.runsheetCampuses).toEqual([]);
  });

  it('keeps id-based global grants when the membership type is not GroupType 1', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') return rockResponse([{ Id: 303, FirstName: 'Global', LastName: 'Grant' }]);
      if (path === '/GroupMembers') {
        return rockResponse([{ Id: 3, GroupId: 4, GroupRoleId: 1, GroupTypeId: 99, GroupMemberStatus: '1' }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess(303);

    expect(result.rolesMap.editor).toEqual(['4']);
    expect(result.access.runsheetCampuses).toEqual(['ALL']);
  });

  it('uses the declared campus root when Rock omits that root from fetched groups', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') return rockResponse([{ Id: 304, FirstName: 'Root', LastName: 'Missing' }]);
      if (path === '/GroupMembers') {
        return rockResponse([{ Id: 4, GroupId: 7002, GroupRoleId: 1, GroupTypeId: 28, GroupMemberStatus: '1' }]);
      }
      if (path === '/Groups' && url.searchParams.get('$filter') === 'GroupTypeId eq 28') {
        return rockResponse([{ Id: 7002, GroupTypeId: 28, Name: 'MNL Staff', ParentGroupId: 32893 }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess(304);

    expect(result.rolesMap.editor).toEqual(['7002']);
    expect(result.access.runsheetCampuses).toEqual(['MNL']);
  });

  it('falls back when GroupType 23 returns an empty leader-role set', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mockFetch.mockImplementation(async (input) => {
        const url = new URL(String(input));
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/People') return rockResponse([{ Id: 305, FirstName: 'Fallback', LastName: 'Leader' }]);
        if (path === '/GroupMembers') {
          return rockResponse([{ Id: 5, GroupId: 19109, GroupRoleId: 69, GroupTypeId: 23, GroupMemberStatus: '1' }]);
        }
        if (path === '/Groups' && url.searchParams.get('$filter') === 'GroupTypeId eq 23') {
          return rockResponse([{ Id: 19109, GroupTypeId: 23, Name: 'MNL Events Team', ParentGroupId: 57 }]);
        }
        if (path === '/GroupTypeRoles') return rockResponse([]);
        return rockResponse([]);
      });

      const result = await rockResolveAccess(305);

      expect(result.rolesMap.editor).toEqual(['19109']);
      expect(result.access.runsheetCampuses).toEqual(['MNL']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('GroupTypeRole.IsLeader lookup failed'),
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
