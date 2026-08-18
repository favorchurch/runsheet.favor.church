export interface AuditFixtureGroup {
  Id: number;
  GroupTypeId: number;
  Name: string;
  ParentGroupId?: number | null;
}

export interface AuditFixtureMembership {
  Id: number;
  PersonId: number;
  GroupId: number;
  GroupRoleId?: number | null;
  GroupTypeId: number;
  GroupMemberStatus: number | string;
  IsArchived?: boolean | string;
}

export interface AuditFixturePerson {
  Id: number;
  FirstName: string;
  LastName?: string;
  Email?: string;
}

export interface AuditFixtureLeaderRole {
  Id: number;
  Name: string;
  IsLeader: boolean;
}

export interface RunsheetAccessAuditFixture {
  groups: AuditFixtureGroup[];
  memberships: AuditFixtureMembership[];
  people: AuditFixturePerson[];
  leaderRoles: AuditFixtureLeaderRole[];
}

/**
 * Small deterministic fixture for `pnpm audit:access -- --fixture` and the
 * offline audit tests. The role table intentionally disagrees with the old
 * hard-coded leader list for Captain (69), proving that live IsLeader wins.
 */
export const RUNSHEET_ACCESS_AUDIT_FIXTURE: RunsheetAccessAuditFixture = {
  groups: [
    { Id: 2, GroupTypeId: 1, Name: 'RSR - Rock Administration', ParentGroupId: null },
    { Id: 46, GroupTypeId: 1, Name: 'Global Staff', ParentGroupId: null },
    { Id: 32879, GroupTypeId: 1, Name: 'GLB | Dashboard Creator', ParentGroupId: null },
    { Id: 4, GroupTypeId: 1, Name: 'WEB - Administration', ParentGroupId: null },
    { Id: 5, GroupTypeId: 1, Name: 'WEB - General Editor', ParentGroupId: null },
    { Id: 32893, GroupTypeId: 28, Name: 'Manila', ParentGroupId: null },
    { Id: 32898, GroupTypeId: 28, Name: 'Brisbane', ParentGroupId: null },
    { Id: 32902, GroupTypeId: 28, Name: 'Seoul', ParentGroupId: null },
    { Id: 900, GroupTypeId: 28, Name: 'MNL Staff', ParentGroupId: 32893 },
    { Id: 901, GroupTypeId: 28, Name: 'BNE Staff', ParentGroupId: 32898 },
    { Id: 57, GroupTypeId: 23, Name: 'MNL Ministry Teams', ParentGroupId: null },
    { Id: 59, GroupTypeId: 23, Name: 'BNE Ministry Teams', ParentGroupId: null },
    { Id: 910, GroupTypeId: 23, Name: 'MNL Events Team', ParentGroupId: 57 },
    { Id: 911, GroupTypeId: 23, Name: 'YTH Events Team', ParentGroupId: 57 },
    { Id: 912, GroupTypeId: 23, Name: 'Orphan Events Team', ParentGroupId: 99999 },
    { Id: 913, GroupTypeId: 23, Name: 'MNL Worship Team', ParentGroupId: 57 },
  ],
  memberships: [
    { Id: 1, PersonId: 100, GroupId: 2, GroupTypeId: 1, GroupMemberStatus: 1 },
    { Id: 2, PersonId: 101, GroupId: 32879, GroupTypeId: 1, GroupMemberStatus: 1 },
    { Id: 3, PersonId: 102, GroupId: 4, GroupTypeId: 1, GroupMemberStatus: 1 },
    { Id: 4, PersonId: 103, GroupId: 900, GroupTypeId: 28, GroupMemberStatus: 1 },
    { Id: 5, PersonId: 104, GroupId: 911, GroupRoleId: 55, GroupTypeId: 23, GroupMemberStatus: 1 },
    { Id: 6, PersonId: 105, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: 1 },
    { Id: 7, PersonId: 106, GroupId: 910, GroupRoleId: 69, GroupTypeId: 23, GroupMemberStatus: 1 },
    { Id: 8, PersonId: 107, GroupId: 912, GroupRoleId: 55, GroupTypeId: 23, GroupMemberStatus: 1 },
    { Id: 9, PersonId: 108, GroupId: 913, GroupRoleId: 70, GroupTypeId: 23, GroupMemberStatus: 1 },
    { Id: 10, PersonId: 109, GroupId: 901, GroupTypeId: 28, GroupMemberStatus: 1 },
    { Id: 11, PersonId: 110, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: 2 },
    { Id: 12, PersonId: 111, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: 1, IsArchived: true },
    { Id: 13, PersonId: 112, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: '1' },
    { Id: 14, PersonId: 113, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: 1, IsArchived: 'True' },
  ],
  people: [
    { Id: 100, FirstName: 'Rock', LastName: 'Administrator', Email: 'rock@example.test' },
    { Id: 101, FirstName: 'Dashboard', LastName: 'Creator', Email: 'dashboard@example.test' },
    { Id: 102, FirstName: 'Web', LastName: 'Editor', Email: 'web@example.test' },
    { Id: 103, FirstName: 'MNL', LastName: 'Staff', Email: 'mnl@example.test' },
    { Id: 104, FirstName: 'YTH', LastName: 'Events Leader', Email: 'yth@example.test' },
    { Id: 105, FirstName: 'Events', LastName: 'Member', Email: 'member@example.test' },
    { Id: 106, FirstName: 'Events', LastName: 'Captain', Email: 'captain@example.test' },
    { Id: 107, FirstName: 'Orphan', LastName: 'Leader', Email: 'orphan@example.test' },
    { Id: 108, FirstName: 'Potential', LastName: 'Captain', Email: 'potential@example.test' },
    { Id: 109, FirstName: 'BNE', LastName: 'Staff', Email: 'bne@example.test' },
    { Id: 110, FirstName: 'Inactive', LastName: 'Member', Email: 'inactive@example.test' },
    { Id: 111, FirstName: 'Archived', LastName: 'Member', Email: 'archived@example.test' },
    { Id: 112, FirstName: 'String', LastName: 'Status Member', Email: 'stringstatus@example.test' },
    { Id: 113, FirstName: 'String', LastName: 'Archived Member', Email: 'stringarchived@example.test' },
  ],
  leaderRoles: [
    { Id: 19, Name: 'Member', IsLeader: false },
    { Id: 55, Name: 'Unit Head', IsLeader: true },
    { Id: 69, Name: 'Captain', IsLeader: false },
    { Id: 70, Name: 'Potential Captain', IsLeader: false },
    { Id: 75, Name: 'Team Lead', IsLeader: true },
  ],
};

/**
 * Regression fixture with enough groups to exceed Rock's OData node budget if
 * all group ids are sent in the old 40-id batches.
 */
export const RUNSHEET_ACCESS_AUDIT_NODE_LIMIT_FIXTURE: RunsheetAccessAuditFixture = {
  groups: [
    ...RUNSHEET_ACCESS_AUDIT_FIXTURE.groups,
    ...Array.from({ length: 45 }, (_, index) => ({
      Id: 10000 + index,
      GroupTypeId: 28,
      Name: `Node Budget Group ${index}`,
      ParentGroupId: null,
    })),
  ],
  memberships: [
    ...RUNSHEET_ACCESS_AUDIT_FIXTURE.memberships,
    { Id: 1000, PersonId: 2000, GroupId: 10000, GroupTypeId: 28, GroupMemberStatus: 1 },
  ],
  people: [
    ...RUNSHEET_ACCESS_AUDIT_FIXTURE.people,
    { Id: 2000, FirstName: 'Chunked', LastName: 'Member', Email: 'chunked@example.test' },
  ],
  leaderRoles: RUNSHEET_ACCESS_AUDIT_FIXTURE.leaderRoles,
};
