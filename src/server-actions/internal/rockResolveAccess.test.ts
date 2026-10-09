import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CloudflareBlockError, rockResolveAccess } from './rockResolveAccess';
import { readRockObjectCache, writeRockObjectCache } from './rockObjectCache';
import { fetchKidsScheduleIds } from '@/server-actions/internal/rockKidsSchedules';

jest.mock('./rockObjectCache', () => ({
  readRockObjectCache: jest.fn(async () => ({ hit: false })),
  writeRockObjectCache: jest.fn(async () => undefined),
}));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({
  assertAuthenticated: jest.fn(async () => undefined),
}));
jest.mock('@/server-actions/internal/rockKidsSchedules', () => ({
  fetchKidsScheduleIds: jest.fn(async () => new Set<number>()),
}));

const mockReadRockObjectCache = jest.mocked(readRockObjectCache);
const mockWriteRockObjectCache = jest.mocked(writeRockObjectCache);
const mockFetchKidsScheduleIds = jest.mocked(fetchKidsScheduleIds);

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
    mockFetchKidsScheduleIds.mockResolvedValue(new Set<number>());
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

      expect(result.rolesMap.editor).toBeUndefined();
      expect(result.rolesMap.viewer).toEqual(['19109']);
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
        return rockResponse([{ Id: 19109, GroupTypeId: 23, Name: 'MNL Events Team', ParentGroupId: 57 }]);
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

  it('adds rostered-only keys from Scheduler attendances, excluding Grow schedules', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') return rockResponse([{ Id: 410, FirstName: 'Rostered', LastName: 'Volunteer' }]);
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9410 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 1, CampusId: 1, StartDateTime: '2099-09-27T15:00:00' },
          { OccurrenceId: 2, CampusId: 1, StartDateTime: '2099-09-27T15:00:00' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 1, ScheduleId: 311, OccurrenceDate: '2099-09-27T00:00:00' },
          { Id: 2, ScheduleId: 752, OccurrenceDate: '2099-09-27T00:00:00' },
        ]);
      }
      if (path === '/Schedules') return rockResponse([{ Id: 752, Name: 'MNL Grow - Build x FDNA', iCalendarContent: '' }]);
      return rockResponse([]);
    });

    const result = await rockResolveAccess([410]);

    expect(result.rolesMap.rosteredViewer).toEqual(['MNL:2099-09-27:15:00:00']);
    expect(result.rolesMap.growViewer).toEqual(['752:2099-09-27']);
    expect(result.rolesMap.viewer).toBeUndefined();

    const attendanceCalls = mockFetch.mock.calls
      .map(([input]) => decodeURIComponent(String(input).replace(/\+/g, ' ')))
      .filter((url) => url.includes('/Attendances'));
    expect(attendanceCalls.length).toBe(1);
    expect(attendanceCalls[0]).toContain('(ScheduledToAttend eq true or RequestedToAttend eq true)');
    expect(attendanceCalls[0]).toContain("RSVP ne '2'");
  });

  it('exercises the full fetch path with a checked-in attendance (CampusId null, StartDateTime 06:33:26) and asserts rosteredViewer keys', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') {
        return rockResponse([{ Id: 411, FirstName: 'Bryan', LastName: 'Opano' }]);
      }
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9411 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 10, CampusId: null, StartDateTime: '2026-10-04T06:33:26' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 10, ScheduleId: 564, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
        ]);
      }
      if (path === '/Schedules') {
        if (filter.includes('Id eq 564')) {
          expect(url.searchParams.get('$select')).toContain('WeeklyTimeOfDay');
          return rockResponse([
            {
              Id: 564,
              Name: 'MNL Crowne 9AM',
              iCalendarContent: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20260816T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR',
              WeeklyTimeOfDay: '09:00:00',
            },
          ]);
        }
        return rockResponse([]);
      }
      if (path === '/Groups') {
        if (filter.includes('Id eq 1001')) {
          return rockResponse([{ Id: 1001, CampusId: 1 }]);
        }
        return rockResponse([]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([411]);

    expect(result.rolesMap.rosteredViewer).toEqual(['MNL:2026-10-04:09:00:00']);
  });

  it('keeps keys for both 9AM and 11:30AM when a volunteer is rostered for both and checked in', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') return rockResponse([{ Id: 412, FirstName: 'Multi', LastName: 'Rostered' }]);
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9412 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 10, CampusId: null, StartDateTime: '2026-10-04T06:33:26' },
          { OccurrenceId: 11, CampusId: null, StartDateTime: '2026-10-04T08:52:10' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 10, ScheduleId: 564, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
          { Id: 11, ScheduleId: 557, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
        ]);
      }
      if (path === '/Schedules') {
        if (filter.includes('Id eq 564') || filter.includes('Id eq 557')) {
          return rockResponse([
            {
              Id: 564,
              Name: 'MNL Crowne 9AM',
              iCalendarContent: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20260816T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR',
              WeeklyTimeOfDay: '09:00:00',
            },
            {
              Id: 557,
              Name: 'MNL Crowne 11:30AM',
              iCalendarContent: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20260816T113000\r\nRRULE:FREQ=WEEKLY;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR',
              WeeklyTimeOfDay: '11:30:00',
            },
          ]);
        }
        return rockResponse([]);
      }
      if (path === '/Groups') {
        return rockResponse([{ Id: 1001, CampusId: 1 }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([412]);

    expect(result.rolesMap.rosteredViewer).toEqual([
      'MNL:2026-10-04:09:00:00',
      'MNL:2026-10-04:11:30:00',
    ]);
  });

  it('yields no rostered key when team group CampusId is null and attendance CampusId is null', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') return rockResponse([{ Id: 413, FirstName: 'NoCampus', LastName: 'Volunteer' }]);
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9413 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 12, CampusId: null, StartDateTime: '2026-10-04T06:33:26' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 12, ScheduleId: 564, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1002 },
        ]);
      }
      if (path === '/Schedules') {
        if (filter.includes('Id eq 564')) {
          return rockResponse([
            { Id: 564, Name: 'MNL Crowne 9AM', iCalendarContent: '', WeeklyTimeOfDay: '09:00:00' },
          ]);
        }
        return rockResponse([]);
      }
      if (path === '/Groups') {
        return rockResponse([{ Id: 1002, CampusId: null }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([413]);

    expect(result.rolesMap.rosteredViewer).toBeUndefined();
  });

  it('resolves schedule time from WeeklyTimeOfDay when iCal is absent, and falls through to attendance StartDateTime when WeeklyTimeOfDay is null or malformed', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      const filter = url.searchParams.get('$filter') || '';

      if (path === '/People') return rockResponse([{ Id: 414, FirstName: 'FallThrough', LastName: 'Volunteer' }]);
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9414 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 20, CampusId: null, StartDateTime: '2026-10-04T06:33:26' },
          { OccurrenceId: 21, CampusId: null, StartDateTime: '2026-10-04T15:00:00' },
          { OccurrenceId: 22, CampusId: null, StartDateTime: '2026-10-04T17:00:00' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 20, ScheduleId: 564, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
          { Id: 21, ScheduleId: 565, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
          { Id: 22, ScheduleId: 566, OccurrenceDate: '2026-10-04T00:00:00', GroupId: 1001 },
        ]);
      }
      if (path === '/Schedules') {
        const results = [];
        if (filter.includes('564')) {
          results.push({ Id: 564, Name: 'MNL Crowne 9AM', iCalendarContent: '', WeeklyTimeOfDay: '09:00:00' });
        }
        if (filter.includes('565')) {
          results.push({ Id: 565, Name: 'MNL Crowne 3PM', iCalendarContent: null, WeeklyTimeOfDay: null });
        }
        if (filter.includes('566')) {
          results.push({ Id: 566, Name: 'MNL Crowne 5PM', iCalendarContent: '', WeeklyTimeOfDay: 'malformed' });
        }
        return rockResponse(results);
      }
      if (path === '/Groups') {
        return rockResponse([{ Id: 1001, CampusId: 1 }]);
      }
      return rockResponse([]);
    });

    const result = await rockResolveAccess([414]);

    expect(result.rolesMap.rosteredViewer).toEqual([
      'MNL:2026-10-04:09:00:00',
      'MNL:2026-10-04:15:00:00',
      'MNL:2026-10-04:17:00:00',
    ]);
  });

  it('sets isMinistryTeamVolunteer to true from active GroupType 23 memberships', async () => {
    // Person 101 has GroupType 23 membership (GroupId 19109) in responseFor
    const result = await rockResolveAccess([101]);

    expect(result.isMinistryTeamVolunteer).toBe(true);
    expect(result.access.isMinistryTeamVolunteer).toBe(true);
    expect(result.accessDiagnostics?.membershipCountsByGroupType[23]).toBe(1);
    expect(result.accessDiagnostics?.personResolved).toBe(true);
  });

  it('sets isMinistryTeamVolunteer to false for non-member with zero GroupType 23 memberships', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') {
        return rockResponse([{ Id: 102, FirstName: 'Non', LastName: 'Volunteer', Email: 'non@example.com' }]);
      }
      if (path === '/GroupMembers') {
        // Only GroupType 1 membership, no GroupType 23
        return rockResponse([
          { Id: 10, GroupId: 32879, GroupRoleId: 1, GroupTypeId: 1, GroupMemberStatus: '1' },
        ]);
      }
      return rockResponse(responseFor(path, url));
    });

    const result = await rockResolveAccess([102]);

    expect(result.isMinistryTeamVolunteer).toBe(false);
    expect(result.access.isMinistryTeamVolunteer).toBe(false);
    expect(result.accessDiagnostics?.membershipCountsByGroupType[23]).toBeUndefined();
    expect(result.accessDiagnostics?.personResolved).toBe(true);
  });

  it('proves a failing fetchKidsScheduleIds yields rosterLookupFailed=true and partial=true', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetchKidsScheduleIds.mockRejectedValueOnce(new Error('Rock Categories failure'));

    const result = await rockResolveAccess([101]);

    expect(result.rosterLookupFailed).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.accessDiagnostics?.rosterLookupFailed).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[runsheet-access] roster/Grow access lookup failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});


