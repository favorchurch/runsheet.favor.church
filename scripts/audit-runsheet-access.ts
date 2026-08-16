/**
 * Read-only audit of the Rock principals that the runsheet access model can
 * grant. Run live with `pnpm audit:access` or offline with
 * `pnpm audit:access -- --fixture`.
 *
 * This script deliberately exposes only a GET reader. It does not import the
 * server-action write wrappers, and the HTTP reader has no method parameter a
 * caller could change to POST, PATCH, or DELETE.
 */
import { loadEnvConfig } from '@next/env';
import {
  ALL_CAMPUSES,
  GLOBAL_EDIT_GROUP_IDS,
  resolveRunsheetAccessPolicy,
  type RunsheetPolicyGroup,
  type RunsheetPolicyMembership,
} from '../src/lib/runsheetAccessPolicy';
import {
  RUNSHEET_ACCESS_AUDIT_FIXTURE,
  type RunsheetAccessAuditFixture,
} from './audit-runsheet-access.fixtures';

const RELEVANT_GROUP_TYPE_IDS = new Set([1, 23, 28]);
const EVENTS_TEAM_NAME_PATTERN = /events team$/i;
const GROUP_MEMBER_BATCH_SIZE = 40;
const PEOPLE_BATCH_SIZE = 40;

const CAMPUS_ROOTS: ReadonlyArray<readonly [number, RunsheetPolicyGroup]> = [
  [32893, { groupId: 32893, groupTypeId: 28, parentGroupId: null, campus: 'MNL' }],
  [32898, { groupId: 32898, groupTypeId: 28, parentGroupId: null, campus: 'BNE' }],
  [32902, { groupId: 32902, groupTypeId: 28, parentGroupId: null, campus: 'SEL' }],
  [57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }],
  [59, { groupId: 59, groupTypeId: 23, parentGroupId: null, campus: 'BNE' }],
  [58, { groupId: 58, groupTypeId: 23, parentGroupId: null, campus: 'SEL' }],
];

export interface RockReader {
  get(path: string, params?: Record<string, string | number | boolean>): Promise<unknown>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuditGroup {
  Id: number;
  GroupTypeId: number;
  Name: string;
  ParentGroupId?: number | null;
}

export interface AuditMembership {
  Id?: number;
  PersonId: number;
  GroupId: number;
  GroupRoleId?: number | null;
  GroupTypeId?: number;
  GroupMemberStatus?: number | string;
  IsArchived?: boolean | string;
}

export interface AuditPerson {
  Id: number;
  FirstName?: string;
  LastName?: string;
  Email?: string;
}

export interface AuditLeaderRole {
  Id: number;
  Name?: string;
  IsLeader?: boolean | string;
}

export interface EffectivePrincipalAccess {
  personId: number;
  name: string;
  email?: string;
  rolesMap: { editor?: string[]; viewer?: string[] };
  runsheetCampuses: string[];
  memberships: Array<{
    groupId: number;
    groupName: string;
    groupTypeId: number;
    groupRoleId?: number | null;
  }>;
}

export interface RunsheetAccessAuditReport {
  generatedAt: string;
  readOnly: true;
  leaderRoles: Array<{ id: number; name?: string; isLeader: boolean }>;
  usedLeaderRoleFallback: boolean;
  requiredGlobalGroups: Array<{ id: number; present: boolean; name?: string; memberCount: number }>;
  groups: Array<{
    id: number;
    name: string;
    groupTypeId: number;
    parentGroupId?: number | null;
    memberCount: number;
  }>;
  principals: EffectivePrincipalAccess[];
  allCampusEditors: Array<{ personId: number; name: string }>;
  eventsTeamGroupsWithoutCampus: Array<{ groupId: number; name: string }>;
  summary: {
    groupCount: number;
    activeMembershipCount: number;
    principalCount: number;
    viewerCount: number;
    editorCount: number;
    allCampusEditorCount: number;
    eventsTeamWithoutCampusCount: number;
    missingRequiredGlobalGroupIds: number[];
  };
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { Items?: unknown }).Items)) {
    return (value as { Items: T[] }).Items;
  }
  return [];
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size) as T[]);
  }
  return result;
}

function numericId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isActiveMembership(membership: AuditMembership): boolean {
  const status = membership.GroupMemberStatus;
  const archived = membership.IsArchived;
  return (
    (status === undefined || String(status) === '1') &&
    (archived === undefined || (archived !== true && String(archived).toLowerCase() !== 'true'))
  );
}

function normalizeGroup(raw: AuditGroup): AuditGroup | null {
  const id = numericId(raw.Id);
  const groupTypeId = numericId(raw.GroupTypeId);
  if (!id || !groupTypeId || typeof raw.Name !== 'string') return null;
  return {
    Id: id,
    GroupTypeId: groupTypeId,
    Name: raw.Name,
    ParentGroupId: raw.ParentGroupId == null ? null : numericId(raw.ParentGroupId),
  };
}

function buildPolicyMaps(groups: readonly AuditGroup[]) {
  const policyGroups = new Map<number, RunsheetPolicyGroup>();
  for (const group of groups) {
    policyGroups.set(group.Id, {
      groupId: group.Id,
      groupTypeId: group.GroupTypeId,
      name: group.Name,
      parentGroupId: group.ParentGroupId,
    });
  }

  return {
    groups: policyGroups,
    campusRoots: new Map<number, RunsheetPolicyGroup>(CAMPUS_ROOTS),
  };
}

function normalizeLeaderRoles(rawRoles: readonly AuditLeaderRole[]) {
  const roles = rawRoles.flatMap((role) => {
      const id = numericId(role.Id);
      if (!id) return [];
      return [{
        id,
        name: role.Name,
        isLeader: role.IsLeader === true || String(role.IsLeader).toLowerCase() === 'true',
      }];
    })
    .sort((a, b) => a.id - b.id);

  if (roles.length === 0) {
    throw new Error('Rock returned no GroupType 23 roles; refusing to invent live leader values.');
  }

  return {
    roles,
    leaderRoleIds: new Set(roles.filter((role) => role.isLeader).map((role) => role.id)),
  };
}

function makeGroupFilter(groupIds: readonly number[]): string {
  return groupIds.map((id) => `GroupId eq ${id}`).join(' or ');
}

function makePeopleFilter(personIds: readonly number[]): string {
  return personIds.map((id) => `Id eq ${id}`).join(' or ');
}

function groupPolicy(
  group: AuditGroup,
  policyMaps: ReturnType<typeof buildPolicyMaps>,
  leaderRoleIds: ReadonlySet<number>,
  leaderRoleLookupFailed: boolean,
) {
  return resolveRunsheetAccessPolicy(
    [{ groupId: group.Id, groupTypeId: group.GroupTypeId }],
    policyMaps.groups,
    policyMaps.campusRoots,
    leaderRoleIds,
    leaderRoleLookupFailed,
  );
}

function principalPolicy(
  memberships: readonly AuditMembership[],
  policyMaps: ReturnType<typeof buildPolicyMaps>,
  leaderRoleIds: ReadonlySet<number>,
  leaderRoleLookupFailed: boolean,
) {
  const policyMemberships: RunsheetPolicyMembership[] = memberships.map((membership) => ({
    groupId: membership.GroupId,
    groupTypeId: membership.GroupTypeId || policyMaps.groups.get(membership.GroupId)?.groupTypeId || 0,
    groupRoleId: membership.GroupRoleId == null ? undefined : Number(membership.GroupRoleId),
  }));

  return resolveRunsheetAccessPolicy(
    policyMemberships,
    policyMaps.groups,
    policyMaps.campusRoots,
    leaderRoleIds,
    leaderRoleLookupFailed,
  );
}

function createFixtureReader(fixture: RunsheetAccessAuditFixture): RockReader {
  return {
    async get(path) {
      if (path === '/Groups') return fixture.groups;
      if (path === '/GroupMembers') return fixture.memberships;
      if (path === '/People') return fixture.people;
      if (path === '/GroupTypeRoles') return fixture.leaderRoles;
      return [];
    },
  };
}

export function createReadOnlyRockReader(
  rockUrl: string,
  rockKey: string,
  fetchImpl: FetchLike = fetch,
): RockReader {
  const baseUrl = rockUrl.replace(/\/+$/, '');
  return {
    async get(path, params) {
      const url = new URL(`${baseUrl}${path}`);
      for (const [key, value] of Object.entries(params || {})) {
        url.searchParams.set(key, String(value));
      }

      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization-Token': rockKey,
          Accept: 'application/json',
        },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Rock API error ${response.status}: ${text}`);
      if (!text.trim()) return null;

      return JSON.parse(text);
    },
  };
}

export async function collectRunsheetAccessAudit(reader: RockReader): Promise<RunsheetAccessAuditReport> {
  const [securityRoleGroups, orgUnitGroups, ministryTeamGroups, rawLeaderRoles] = await Promise.all([
    reader.get('/Groups', { $filter: 'GroupTypeId eq 1', $select: 'Id,GroupTypeId,Name,ParentGroupId', $top: 2000 }),
    reader.get('/Groups', { $filter: 'GroupTypeId eq 28', $select: 'Id,GroupTypeId,Name,ParentGroupId', $top: 2000 }),
    reader.get('/Groups', { $filter: 'GroupTypeId eq 23', $select: 'Id,GroupTypeId,Name,ParentGroupId', $top: 2000 }),
    reader.get('/GroupTypeRoles', { $filter: 'GroupTypeId eq 23', $select: 'Id,Name,IsLeader', $top: 100 }),
  ]);

  const groups = Array.from(
    new Map(
      [...asArray<AuditGroup>(securityRoleGroups), ...asArray<AuditGroup>(orgUnitGroups), ...asArray<AuditGroup>(ministryTeamGroups)]
        .map(normalizeGroup)
        .filter((group): group is AuditGroup => group !== null)
        .map((group) => [group.Id, group] as const),
    ).values(),
  ).filter((group) => RELEVANT_GROUP_TYPE_IDS.has(group.GroupTypeId));

  const policyMaps = buildPolicyMaps(groups);
  const leaderData = normalizeLeaderRoles(asArray<AuditLeaderRole>(rawLeaderRoles));
  const groupIds = groups.map((group) => group.Id);
  const rawMemberships: AuditMembership[] = [];

  await Promise.all(
    chunks(groupIds, GROUP_MEMBER_BATCH_SIZE).map(async (batch) => {
      const members = asArray<AuditMembership>(
        await reader.get('/GroupMembers', {
          $filter: `${makeGroupFilter(batch)} and GroupMemberStatus eq '1' and IsArchived eq false`,
          $select: 'Id,PersonId,GroupId,GroupRoleId,GroupTypeId,GroupMemberStatus,IsArchived',
          $top: 5000,
        }),
      );
      rawMemberships.push(...members);
    }),
  );

  const uniqueMemberships = new Map<string, AuditMembership>();
  for (const membership of rawMemberships) {
    if (!isActiveMembership(membership)) continue;
    const personId = numericId(membership.PersonId);
    const groupId = numericId(membership.GroupId);
    if (!personId || !groupId || !policyMaps.groups.has(groupId)) continue;
    uniqueMemberships.set(`${personId}:${groupId}:${membership.GroupRoleId ?? ''}`, {
      ...membership,
      PersonId: personId,
      GroupId: groupId,
    });
  }
  const memberships = Array.from(uniqueMemberships.values());

  const personIds = Array.from(new Set(memberships.map((membership) => membership.PersonId)));
  const rawPeople: AuditPerson[] = [];
  await Promise.all(
    chunks(personIds, PEOPLE_BATCH_SIZE).map(async (batch) => {
      rawPeople.push(
        ...asArray<AuditPerson>(
          await reader.get('/People', {
            $filter: makePeopleFilter(batch),
            $select: 'Id,FirstName,LastName,Email',
            $top: PEOPLE_BATCH_SIZE,
          }),
        ),
      );
    }),
  );

  const people = new Map<number, AuditPerson>();
  for (const person of rawPeople) {
    const id = numericId(person.Id);
    if (id) people.set(id, { ...person, Id: id });
  }

  const principals = personIds
    .map((personId) => {
      const personMemberships = memberships.filter((membership) => membership.PersonId === personId);
      const policy = principalPolicy(
        personMemberships,
        policyMaps,
        leaderData.leaderRoleIds,
        false,
      );
      const person = people.get(personId);
      return {
        personId,
        name: [person?.FirstName, person?.LastName].filter(Boolean).join(' ') || `Person ${personId}`,
        email: person?.Email,
        rolesMap: {
          ...(policy.editorGroupIds.length > 0 ? { editor: policy.editorGroupIds } : {}),
          ...(policy.viewerGroupIds.length > 0 ? { viewer: policy.viewerGroupIds } : {}),
        },
        runsheetCampuses: policy.runsheetCampuses,
        memberships: personMemberships
          .map((membership) => {
            const group = policyMaps.groups.get(membership.GroupId);
            return {
              groupId: membership.GroupId,
              groupName: group?.name || `Group ${membership.GroupId}`,
              groupTypeId: group?.groupTypeId || Number(membership.GroupTypeId) || 0,
              groupRoleId: membership.GroupRoleId,
            };
          })
          .sort((a, b) => a.groupId - b.groupId),
      } satisfies EffectivePrincipalAccess;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.personId - b.personId);

  const groupMembers = new Map<number, number>();
  for (const membership of memberships) {
    groupMembers.set(membership.GroupId, (groupMembers.get(membership.GroupId) || 0) + 1);
  }

  const eventsTeamGroupsWithoutCampus = groups
    .filter((group) => group.GroupTypeId === 23 && EVENTS_TEAM_NAME_PATTERN.test(group.Name.trim()))
    .filter((group) => groupPolicy(group, policyMaps, leaderData.leaderRoleIds, false).runsheetCampuses.length === 0)
    .map((group) => ({ groupId: group.Id, name: group.Name }))
    .sort((a, b) => a.groupId - b.groupId);

  const allCampusEditors = principals
    .filter((principal) => principal.rolesMap.editor && principal.runsheetCampuses.includes(ALL_CAMPUSES))
    .map((principal) => ({ personId: principal.personId, name: principal.name }));

  const requiredGlobalGroups = GLOBAL_EDIT_GROUP_IDS.map((id) => {
    const group = policyMaps.groups.get(id);
    return {
      id,
      present: Boolean(group),
      name: group?.name,
      memberCount: groupMembers.get(id) || 0,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    leaderRoles: leaderData.roles,
    usedLeaderRoleFallback: false,
    requiredGlobalGroups,
    groups: groups
      .map((group) => ({
        id: group.Id,
        name: group.Name,
        groupTypeId: group.GroupTypeId,
        parentGroupId: group.ParentGroupId,
        memberCount: groupMembers.get(group.Id) || 0,
      }))
      .sort((a, b) => a.id - b.id),
    principals,
    allCampusEditors,
    eventsTeamGroupsWithoutCampus,
    summary: {
      groupCount: groups.length,
      activeMembershipCount: memberships.length,
      principalCount: principals.length,
      viewerCount: principals.filter((principal) => principal.rolesMap.viewer).length,
      editorCount: principals.filter((principal) => principal.rolesMap.editor).length,
      allCampusEditorCount: allCampusEditors.length,
      eventsTeamWithoutCampusCount: eventsTeamGroupsWithoutCampus.length,
      missingRequiredGlobalGroupIds: requiredGlobalGroups.filter((group) => !group.present).map((group) => group.id),
    },
  };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const reader = process.argv.includes('--fixture')
    ? createFixtureReader(RUNSHEET_ACCESS_AUDIT_FIXTURE)
    : createReadOnlyRockReader(
        process.env.ROCK_API_URL || process.env.NEXT_PUBLIC_ROCK_API_URL || '',
        process.env.ROCK_API_KEY || '',
      );

  if (!process.argv.includes('--fixture') && (!process.env.ROCK_API_URL && !process.env.NEXT_PUBLIC_ROCK_API_URL || !process.env.ROCK_API_KEY)) {
    throw new Error('ROCK_API_URL (or NEXT_PUBLIC_ROCK_API_URL) and ROCK_API_KEY are required for a live audit.');
  }

  const report = await collectRunsheetAccessAudit(reader);
  console.log(JSON.stringify(report, null, 2));
}

const invokedAsCli = /audit-runsheet-access\.(?:ts|js)$/.test(process.argv[1] || '');
if (invokedAsCli) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
