import {
  collectRunsheetAccessAudit,
  createReadOnlyRockReader,
  ROCK_MAX_CONCURRENT_REQUESTS,
} from '../../../scripts/audit-runsheet-access';
import {
  RUNSHEET_ACCESS_AUDIT_FIXTURE,
  RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE,
} from '../../../scripts/audit-runsheet-access.fixtures';

function filterIds(filter: string, field: string): number[] {
  return Array.from(filter.matchAll(new RegExp(`${field} eq (\\d+)`, 'g')), (match) => Number(match[1]));
}

// Rock's OData validator walks FOUR nodes per equality clause: the binary
// operator, the property access, the range-variable reference, and the constant.
// Charging 3 (as an earlier version did) made this bound optimistic: with `g`
// ids the real cost is 5g+9, so a `<= 100` assertion at 3 nodes/clause admitted
// g <= 23 while Rock actually rejects above g = 18 — leaving g in 19..23 passing
// the test but failing live. Keep this at 4 so the guard is not weaker than it
// reads.
const ODATA_NODES_PER_EQUALITY = 4;
const ODATA_NODE_LIMIT = 100;

function estimateODataNodeCount(filter: string): number {
  const equalityNodes = (filter.match(/\beq\b/g) || []).length * ODATA_NODES_PER_EQUALITY;
  const logicalNodes = (filter.match(/\b(?:and|or)\b/g) || []).length;
  return equalityNodes + logicalNodes;
}

function fixtureReader() {
  return {
    async get(path: string) {
      if (path === '/Groups') return RUNSHEET_ACCESS_AUDIT_FIXTURE.groups;
      if (path === '/GroupMembers') return RUNSHEET_ACCESS_AUDIT_FIXTURE.memberships;
      if (path === '/People') return RUNSHEET_ACCESS_AUDIT_FIXTURE.people;
      if (path === '/GroupTypeRoles') return RUNSHEET_ACCESS_AUDIT_FIXTURE.leaderRoles;
      return [];
    },
  };
}

describe('runsheet access audit', () => {
  it('resolves fixture principals through the real policy and reports drift', async () => {
    const report = await collectRunsheetAccessAudit(fixtureReader());
    const byName = new Map(report.principals.map((principal) => [principal.name, principal]));

    expect(byName.get('Dashboard Creator')?.rolesMap.editor).toContain('32879');
    expect(byName.get('Dashboard Creator')?.runsheetCampuses).toEqual(['ALL']);
    expect(byName.get('YTH Events Leader')?.rolesMap.editor).toContain('911');
    expect(byName.get('YTH Events Leader')?.runsheetCampuses).toEqual(['MNL']);
    expect(byName.get('Events Member')?.rolesMap.editor).toBeUndefined();
    expect(byName.get('Events Captain')?.rolesMap.editor).toBeUndefined();
    expect(byName.get('Potential Captain')?.rolesMap.editor).toBeUndefined();
    expect(byName.get('Orphan Leader')?.rolesMap.viewer).toContain('912');
    expect(byName.get('Orphan Leader')?.runsheetCampuses).toEqual([]);
    expect(report.leaderRoles.find((role) => role.id === 69)?.isLeader).toBe(false);
    expect(report.eventsTeamGroupsWithoutCampus).toEqual([{ groupId: 912, name: 'Orphan Events Team' }]);
    expect(report.summary.editorCount).toBe(7);
    expect(report.summary.allCampusEditorCount).toBe(3);
  });

  it('uses only GET requests in the Rock reader', async () => {
    const methods: string[] = [];
    const fetchImpl = async (input: string, init?: RequestInit) => {
      methods.push(String(init?.method));
      return {
        ok: true,
        status: 200,
        text: async () => (input.includes('/GroupTypeRoles') ? JSON.stringify(RUNSHEET_ACCESS_AUDIT_FIXTURE.leaderRoles) : '[]'),
      } as Response;
    };

    const report = await collectRunsheetAccessAudit(
      createReadOnlyRockReader('https://rock.test.invalid/api', 'fixture-key', fetchImpl),
    );

    expect(report.readOnly).toBe(true);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => method === 'GET')).toBe(true);
    expect(methods.some((method) => ['POST', 'PATCH', 'DELETE'].includes(method))).toBe(false);
  });

  it('chunks large Rock filters below the OData node limit and merges results', async () => {
    const requests: Array<{ path: string; filter: string }> = [];
    const fetchImpl = async (input: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET');

      const url = new URL(input);
      const filter = url.searchParams.get('$filter') || '';
      requests.push({ path: url.pathname, filter });

      let body: unknown = [];
      if (url.pathname.endsWith('/Groups')) {
        const groupTypeId = Number(filter.match(/GroupTypeId eq (\d+)/)?.[1]);
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.groups.filter(
          (group) => group.GroupTypeId === groupTypeId,
        );
      } else if (url.pathname.endsWith('/GroupMembers')) {
        const groupIds = filterIds(filter, 'GroupId');
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.memberships.filter(
          (membership) => groupIds.includes(membership.GroupId),
        );
      } else if (url.pathname.endsWith('/People')) {
        const personIds = filterIds(filter, 'Id');
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.people.filter(
          (person) => personIds.includes(person.Id),
        );
      } else if (url.pathname.endsWith('/GroupTypeRoles')) {
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.leaderRoles;
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      } as Response;
    };

    const report = await collectRunsheetAccessAudit(
      createReadOnlyRockReader('https://rock.test.invalid/api', 'fixture-key', fetchImpl),
    );

    const groupMemberRequests = requests.filter(({ path }) => path.endsWith('/GroupMembers'));
    expect(groupMemberRequests.length).toBeGreaterThan(1);
    // OData binds `and` tighter than `or`: without parentheses the
    // active-membership predicates would apply to the last id only.
    expect(
      groupMemberRequests.every(({ filter }) => /^\(GroupId eq \d+( or GroupId eq \d+)*\) and /.test(filter)),
    ).toBe(true);
    expect(groupMemberRequests.every(({ filter }) => estimateODataNodeCount(filter) <= ODATA_NODE_LIMIT)).toBe(true);
    expect(groupMemberRequests.every(({ filter }) => filterIds(filter, 'GroupId').length <= 10)).toBe(true);
    expect(requests.every(({ filter }) => estimateODataNodeCount(filter) <= ODATA_NODE_LIMIT)).toBe(true);
    expect(report.groups.find((group) => group.id === 10000)?.memberCount).toBe(1);
    expect(report.principals.find((principal) => principal.name === 'Chunked Member')?.personId).toBe(2000);
  });

  it('never exceeds its concurrent-request cap on the chunked fetch loops', async () => {
    // Rock is flaky under request bursts, so the chunk loops must not fan out one
    // request per chunk simultaneously.
    //
    // Measure the CHUNKED endpoints only. The audit also issues a fixed 4
    // requests up front (three /Groups lookups + /GroupTypeRoles) via a plain
    // Promise.all outside the limiter; counting those made an earlier version of
    // this test vacuous — its "peak > 1" assertion was satisfied by that header
    // burst alone, so the test still passed with the cap set to 1, i.e. with the
    // limiter fully serialising every chunk.
    const CHUNKED = ['/GroupMembers', '/People'];
    let inFlight = 0;
    let peakInFlight = 0;
    let chunkedRequestCount = 0;

    const fetchImpl = async (input: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      const counted = CHUNKED.some((path) => new URL(input).pathname.endsWith(path));
      if (counted) {
        inFlight += 1;
        chunkedRequestCount += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
      }
      // Yield twice so genuinely-parallel calls overlap and register a peak.
      await Promise.resolve();
      await Promise.resolve();

      const url = new URL(input);
      const filter = url.searchParams.get('$filter') || '';
      let body: unknown = [];
      if (url.pathname.endsWith('/Groups')) {
        const groupTypeId = Number(filter.match(/GroupTypeId eq (\d+)/)?.[1]);
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.groups.filter(
          (group) => group.GroupTypeId === groupTypeId,
        );
      } else if (url.pathname.endsWith('/GroupMembers')) {
        const groupIds = filterIds(filter, 'GroupId');
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.memberships.filter(
          (membership) => groupIds.includes(membership.GroupId),
        );
      } else if (url.pathname.endsWith('/People')) {
        const personIds = filterIds(filter, 'Id');
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.people.filter(
          (person) => personIds.includes(person.Id),
        );
      } else if (url.pathname.endsWith('/GroupTypeRoles')) {
        body = RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE.leaderRoles;
      }

      if (counted) inFlight -= 1;
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
    };

    await collectRunsheetAccessAudit(
      createReadOnlyRockReader('https://rock.test.invalid/api', 'fixture-key', fetchImpl),
    );

    // Floor: the chunk loops really do run in parallel. Fails if the limiter is
    // removed and replaced with a serial loop, or if the cap is set to 1.
    expect(peakInFlight).toBeGreaterThan(1);
    // Ceiling: never more than the production constant. Imported rather than
    // hardcoded, so raising the constant tracks instead of failing misleadingly.
    expect(peakInFlight).toBeLessThanOrEqual(ROCK_MAX_CONCURRENT_REQUESTS);
    // Guard against a future fixture shrinking below the cap and making the
    // ceiling assertion vacuous: there must be more chunked requests than the cap,
    // otherwise "peak <= cap" would hold even with no limiter at all.
    expect(chunkedRequestCount).toBeGreaterThan(ROCK_MAX_CONCURRENT_REQUESTS);
  });
});
