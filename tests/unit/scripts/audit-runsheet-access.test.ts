import { collectRunsheetAccessAudit, createReadOnlyRockReader } from '../../../scripts/audit-runsheet-access';
import { RUNSHEET_ACCESS_AUDIT_FIXTURE } from '../../../scripts/audit-runsheet-access.fixtures';

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
});
