import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CloudflareBlockError, rockResolveAccess } from './rockResolveAccess';
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
    const result = await rockResolveAccess([101]);
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

    const result = await rockResolveAccess([0]);

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

    const result = await rockResolveAccess([202]);

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

    const result = await rockResolveAccess([303]);

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

    const result = await rockResolveAccess([304]);

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

      const result = await rockResolveAccess([305]);

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

  it('unions a second id\'s roles into the result (done-criteria 1)', async () => {
    function filterOf(url: URL): string {
      return url.searchParams.get('$filter') || '';
    }

    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = filterOf(url);

      if (path === '/People') {
        if (filter.includes('Id eq 501')) return rockResponse([{ Id: 501, FirstName: 'Primary', LastName: 'Person' }]);
        if (filter.includes('Id eq 502')) return rockResponse([{ Id: 502, FirstName: 'Secondary', LastName: 'Person' }]);
        return rockResponse([]);
      }
      if (path === '/GroupMembers') {
        if (filter.includes('PersonId eq 501')) {
          return rockResponse([{ Id: 1, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
        }
        if (filter.includes('PersonId eq 502')) {
          return rockResponse([{ Id: 2, GroupId: 19109, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: '1' }]);
        }
        return rockResponse([]);
      }
      if (path === '/Groups' && filter === 'GroupTypeId eq 1') {
        return rockResponse([{ Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null }]);
      }
      if (path === '/Groups' && filter === 'GroupTypeId eq 23') {
        return rockResponse([{ Id: 19109, GroupTypeId: 23, Name: 'MNL Volunteer Team', ParentGroupId: 57 }]);
      }
      if (path === '/GroupTypeRoles') return rockResponse([{ Id: 19, IsLeader: false }]);
      return rockResponse([]);
    });

    const soloResult = await rockResolveAccess([501]);
    expect(soloResult.rolesMap.editor).toEqual(['32879']);
    expect(soloResult.rolesMap.viewer).toEqual(['32879']);
    expect(soloResult.access.runsheetCampuses).toEqual(['ALL']);

    const unionResult = await rockResolveAccess([501, 502]);
    expect(unionResult.rolesMap.editor).toEqual(['32879']);
    expect(unionResult.rolesMap.viewer).toEqual(['32879', '19109']);
    expect(unionResult.access.runsheetCampuses).toEqual(['ALL', 'MNL']);
    expect(unionResult.partial).toBeUndefined();
  });

  it('resolves identity from personIds[0] even when a later, numerically-lower id is in the union (done-criteria 2)', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') {
        if (filter.includes('Id eq 601')) {
          return rockResponse([{ Id: 601, FirstName: 'Primary', LastName: 'Wins', Email: 'primary@example.com' }]);
        }
        if (filter.includes('Id eq 105')) {
          return rockResponse([{ Id: 105, FirstName: 'Lowest', LastName: 'IdPerson' }]);
        }
        return rockResponse([]);
      }
      return rockResponse([]);
    });

    // personIds[0] (601) is the primary even though 105 is numerically lower
    // and appears second — the claim array arrives ascending, not
    // primary-first, and callers are responsible for ordering it.
    const result = await rockResolveAccess([601, 105]);

    expect(result.contact.id).toBe(601);
    expect(result.contact.fullName).toContain('Wins');
    expect(result.contact.email).toBe('primary@example.com');
  });

  it('drops a secondary id that fails the fetchPersonById validity filter, without marking partial (done-criteria 4)', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') {
        if (filter.includes('Id eq 701')) return rockResponse([{ Id: 701, FirstName: 'Valid', LastName: 'Primary' }]);
        // Id 702: valid response shape, but Rock's own filter (active,
        // not deceased) excludes it — the person is inactive/deceased/merged
        // away. This is a plain not-found, not a fetch failure.
        if (filter.includes('Id eq 702')) return rockResponse([]);
        return rockResponse([]);
      }
      if (path === '/GroupMembers') {
        if (filter.includes('PersonId eq 701')) {
          return rockResponse([{ Id: 1, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
        }
        // 702 DOES hold a grant. It must never be queried for memberships,
        // because the validity filter dropped it. Returning a real membership
        // here is what makes this test able to fail: if the validity check is
        // ever skipped, 32880 leaks into rolesMap and the assertion below
        // catches it. An empty response here would make the test vacuous.
        if (filter.includes('PersonId eq 702')) {
          return rockResponse([{ Id: 2, GroupId: 32880, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
        }
        return rockResponse([]);
      }
      // FIXTURE NOTE — load-bearing name: 32880 is not an enumerated global
      // grant id, so it only maps to `editor` because runsheetAccessPolicy
      // matches the literal name 'GLB | Web Developer'. Rename it and this test
      // silently stops being able to detect a leaked secondary. Keep it in sync
      // with src/lib/runsheetAccessPolicy.ts.
      if (path === '/Groups' && filter === 'GroupTypeId eq 1') {
        return rockResponse([
          { Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null },
          { Id: 32880, GroupTypeId: 1, Name: 'GLB | Web Developer', ParentGroupId: null },
        ]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([701, 702]);

    // Only the primary's grant survives; 702's 32880 must be absent.
    expect(result.rolesMap.editor).toEqual(['32879']);
    expect(result.partial).toBeUndefined();
    // And 702's memberships must never have been fetched at all.
    const groupMemberCalls = mockFetch.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/GroupMembers'));
    expect(groupMemberCalls.some((url) => decodeURIComponent(url).includes('PersonId eq 702'))).toBe(false);
  });

  it('propagates a primary-id fetch failure, including CloudflareBlockError (done-criteria 5)', async () => {
    mockFetch.mockImplementation(async () => {
      return {
        ok: false,
        status: 403,
        headers: new Headers({ server: 'cloudflare' }),
        text: async () => 'Just a moment...',
      } as Response;
    });

    await expect(rockResolveAccess([801, 802])).rejects.toBeInstanceOf(CloudflareBlockError);
  });

  // The test above fails EVERY fetch, so on its own it cannot tell "the primary
  // error propagates" apart from "any error propagates". This one fails only the
  // SECONDARY, and requires the call to succeed — so the pair pins the asymmetry.
  it('does not propagate a secondary-id validity failure; drops the id and marks the result partial', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People' && filter.includes('Id eq 901')) {
        return rockResponse([{ Id: 901, FirstName: 'Valid', LastName: 'Primary' }]);
      }
      // Only the secondary's validity fetch is Cloudflare-blocked.
      if (path === '/People' && filter.includes('Id eq 902')) {
        return {
          ok: false,
          status: 403,
          headers: new Headers({ server: 'cloudflare' }),
          text: async () => 'Just a moment...',
        } as Response;
      }
      if (path === '/GroupMembers' && filter.includes('PersonId eq 901')) {
        return rockResponse([{ Id: 1, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
      }
      if (path === '/Groups' && filter === 'GroupTypeId eq 1') {
        return rockResponse([{ Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([901, 902]);

    expect(result.partial).toBe(true);
    expect(result.contact.id).toBe(901);
    expect(result.rolesMap.editor).toEqual(['32879']);
  });

  it('does not propagate a secondary-id membership failure; drops the id and marks the result partial', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People' && filter.includes('Id eq 901')) {
        return rockResponse([{ Id: 901, FirstName: 'Valid', LastName: 'Primary' }]);
      }
      if (path === '/People' && filter.includes('Id eq 902')) {
        return rockResponse([{ Id: 902, FirstName: 'Valid', LastName: 'Household' }]);
      }
      if (path === '/GroupMembers' && filter.includes('PersonId eq 901')) {
        return rockResponse([{ Id: 1, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
      }
      // The secondary passed validity, then its membership query fails. This
      // must NOT deny the signed-in primary user their session.
      if (path === '/GroupMembers' && filter.includes('PersonId eq 902')) {
        return {
          ok: false,
          status: 403,
          headers: new Headers({ server: 'cloudflare' }),
          text: async () => 'Just a moment...',
        } as Response;
      }
      if (path === '/Groups' && filter === 'GroupTypeId eq 1') {
        return rockResponse([{ Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([901, 902]);

    expect(result.partial).toBe(true);
    expect(result.contact.id).toBe(901);
    expect(result.rolesMap.editor).toEqual(['32879']);
  });

  // Identity must stay the primary id. When the primary fails validity and the
  // email fallback lands on a DIFFERENT household member, the union must not be
  // applied on top of that stranger's profile.
  it('does not union secondaries when the primary fails validity and the email fallback resolves someone else', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      // Primary 911 fails its validity filter (inactive/deceased/merged away).
      if (path === '/People' && filter.includes('Id eq 911')) return rockResponse([]);
      // Secondary 912 PASSES validity and holds a real grant. That is what makes
      // this test able to fail: if the primaryResolved gate is removed, 912's
      // memberships get fetched and 32880 leaks onto 913's identity.
      if (path === '/People' && filter.includes('Id eq 912')) {
        return rockResponse([{ Id: 912, FirstName: 'Valid', LastName: 'Household' }]);
      }
      if (path === '/People' && filter.includes("Email eq 'shared@favor.church'")) {
        return rockResponse([{ Id: 913, FirstName: 'Other', LastName: 'Household' }]);
      }
      if (path === '/GroupMembers' && filter.includes('PersonId eq 912')) {
        return rockResponse([{ Id: 2, GroupId: 32880, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' }]);
      }
      if (path === '/Groups' && filter === 'GroupTypeId eq 1') {
        return rockResponse([{ Id: 32880, GroupTypeId: 1, Name: 'GLB | Web Developer', ParentGroupId: null }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([911, 912], 'shared@favor.church');

    expect(result.contact.id).toBe(913);
    // 912's grant must NOT have been unioned onto 913's identity.
    expect(result.rolesMap.editor).toBeUndefined();
    const groupMemberCalls = mockFetch.mock.calls
      .map(([input]) => decodeURIComponent(String(input)))
      .filter((url) => url.includes('/GroupMembers'));
    expect(groupMemberCalls.some((url) => url.includes('PersonId eq 912'))).toBe(false);
  });
});
