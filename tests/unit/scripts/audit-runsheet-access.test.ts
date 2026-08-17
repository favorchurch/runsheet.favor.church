import { collectRunsheetAccessAudit, createReadOnlyRockReader } from '../../../scripts/audit-runsheet-access';
import {
  RUNSHEET_ACCESS_AUDIT_FIXTURE,
  RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE,
} from '../../../scripts/audit-runsheet-access.fixtures';

function filterIds(filter: string, field: string): number[] {
  return Array.from(filter.matchAll(new RegExp(`${field} eq (\\d+)`, 'g')), (match) => Number(match[1]));
}

function estimateODataNodeCount(filter: string): number {
  const equalityNodes = (filter.match(/\beq\b/g) || []).length * 3;
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
    expect(groupMemberRequests.every(({ filter }) => estimateODataNodeCount(filter) <= 100)).toBe(true);
    expect(groupMemberRequests.every(({ filter }) => filterIds(filter, 'GroupId').length <= 10)).toBe(true);
    expect(requests.every(({ filter }) => estimateODataNodeCount(filter) <= 100)).toBe(true);
    expect(report.groups.find((group) => group.id === 10000)?.memberCount).toBe(1);
    expect(report.principals.find((principal) => principal.name === 'Chunked Member')?.personId).toBe(2000);
  });
});
