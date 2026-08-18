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
import { CAMPUS_MINISTRY_TEAM_ROOT_IDS, CAMPUS_ORG_UNIT_ROOT_IDS } from '../src/lib/runsheetAccessRoots';
import {
  RUNSHEET_ACCESS_AUDIT_FIXTURE,
  type RunsheetAccessAuditFixture,
} from './audit-runsheet-access.fixtures';

const RELEVANT_GROUP_TYPE_IDS = new Set([1, 23, 28]);
const EVENTS_TEAM_NAME_PATTERN = /events team$/i;
const ROCK_FILTER_BATCH_SIZE = 10;
const ROCK_GROUPS_FETCH_LIMIT = 2000;
const ROCK_LEADER_ROLES_FETCH_LIMIT = 100;
const ROCK_GROUP_MEMBERS_FETCH_LIMIT = 5000;
const ROCK_PEOPLE_FETCH_LIMIT = ROCK_FILTER_BATCH_SIZE;

function makeCampusRoots(
  roots: Record<number, string>,
  groupTypeId: number,
): ReadonlyArray<readonly [number, RunsheetPolicyGroup]> {
  return Object.entries(roots).map(([groupId, campus]) => [
    Number(groupId),
    { groupId: Number(groupId), groupTypeId, parentGroupId: null, campus: campus as RunsheetPolicyGroup['campus'] },
  ]);
}

const CAMPUS_ROOTS: ReadonlyArray<readonly [number, RunsheetPolicyGroup]> = [
  ...makeCampusRoots(CAMPUS_ORG_UNIT_ROOT_IDS, 28),
  ...makeCampusRoots(CAMPUS_MINISTRY_TEAM_ROOT_IDS, 23),
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

// Rock is flaky under request bursts (Cloudflare 524s / read timeouts), so each
// CHUNKED fetch loop keeps at most this many GETs in flight. Without a cap, a
// large org would fan out one request per chunk simultaneously — ~150 for a
// 1500-principal audit at batch size 10.
//
// Note this bounds the chunk loops only. The three group-type lookups plus the
// leader-role lookup are issued together up front (a fixed 4 requests), outside
// this limiter.
export const ROCK_MAX_CONCURRENT_REQUESTS = 5;

/**
 * Run `task` over `items` with at most `limit` promises in flight at once.
 *
 * `limit` is floored at 1: a non-positive limit would otherwise spawn zero
 * workers and resolve without ever invoking `task`, which in an audit means
 * silently reporting zero memberships and zero editors — a clean-looking
 * security report instead of an error. Failing loudly is mandatory here;
 * under-reporting access is worse than erroring.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index] as T);
    }
  });
  // Promise.all rejects on the first failure, so a Rock error propagates out of
  // the audit rather than yielding a partial report.
  await Promise.all(workers);
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

// The disjunction MUST be parenthesised. OData binds `and` tighter than `or`, so
// `GroupId eq 1 or GroupId eq 2 and IsArchived eq false` applies the archived
// predicate to id 2 only, and every other id returns archived and inactive rows.
// `isActiveMembership` re-filters client-side, so the unparenthesised form
// over-returned rather than under-reported — but the server-side predicates were
// inert for all but the last id in each batch. Parentheses cost 0 OData nodes.
function makeGroupFilter(groupIds: readonly number[]): string {
  return `(${groupIds.map((id) => `GroupId eq ${id}`).join(' or ')})`;
}

function makePeopleFilter(personIds: readonly number[]): string {
  return `(${personIds.map((id) => `Id eq ${id}`).join(' or ')})`;
}

function groupPolicy(
  group: AuditGroup,
  policyMaps: ReturnType<typeof buildPolicyMaps>,
  leaderRoleIds: ReadonlySet<number>,
) {
  return resolveRunsheetAccessPolicy(
    [{ groupId: group.Id, groupTypeId: group.GroupTypeId }],
    policyMaps.groups,
    policyMaps.campusRoots,
    leaderRoleIds,
  );
}

function principalPolicy(
  memberships: readonly AuditMembership[],
  policyMaps: ReturnType<typeof buildPolicyMaps>,
  leaderRoleIds: ReadonlySet<number>,
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
  );
}

function createFixtureReader(fixture: RunsheetAccessAuditFixture): RockReader {
  return {
    async get(path, params) {
      if (path === '/Groups') return fixture.groups;
      if (path === '/GroupMembers') return fixture.memberships;
      if (path === '/People') {
        const filter = String(params?.$filter || '');
        if (filter) {
          const personIds = Array.from(filter.matchAll(/Id eq (\d+)/g), (match) => Number(match[1]));
          return fixture.people.filter((person) => personIds.includes(person.Id));
        }
        return fixture.people;
      }
      if (path === '/GroupTypeRoles') return fixture.leaderRoles;
      return [];
    },
  };
}

async function getBounded<T>(
  reader: RockReader,
  path: string,
  params: Record<string, string | number | boolean>,
  limit: number,
): Promise<T[]> {
  const rows = asArray<T>(await reader.get(path, { ...params, $top: limit + 1 }));
  if (rows.length > limit) {
    throw new Error(
      `Rock query for ${path} exceeded ${limit} rows; aborting audit to prevent silent truncation`,
    );
  }
  return rows;
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
    getBounded<AuditGroup>(reader, '/Groups', { $filter: 'GroupTypeId eq 1', $select: 'Id,GroupTypeId,Name,ParentGroupId' }, ROCK_GROUPS_FETCH_LIMIT),
    getBounded<AuditGroup>(reader, '/Groups', { $filter: 'GroupTypeId eq 28', $select: 'Id,GroupTypeId,Name,ParentGroupId' }, ROCK_GROUPS_FETCH_LIMIT),
    getBounded<AuditGroup>(reader, '/Groups', { $filter: 'GroupTypeId eq 23', $select: 'Id,GroupTypeId,Name,ParentGroupId' }, ROCK_GROUPS_FETCH_LIMIT),
    getBounded<AuditLeaderRole>(reader, '/GroupTypeRoles', { $filter: 'GroupTypeId eq 23', $select: 'Id,Name,IsLeader' }, ROCK_LEADER_ROLES_FETCH_LIMIT),
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

  await mapWithConcurrency(
    chunks(groupIds, ROCK_FILTER_BATCH_SIZE),
    ROCK_MAX_CONCURRENT_REQUESTS,
    async (batch) => {
      const members = await getBounded<AuditMembership>(
        reader,
        '/GroupMembers',
        {
          $filter: `${makeGroupFilter(batch)} and GroupMemberStatus eq '1' and IsArchived eq false`,
          $select: 'Id,PersonId,GroupId,GroupRoleId,GroupTypeId,GroupMemberStatus,IsArchived',
        },
        ROCK_GROUP_MEMBERS_FETCH_LIMIT,
      );
      rawMemberships.push(...members);
    },
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
  await mapWithConcurrency(
    chunks(personIds, ROCK_FILTER_BATCH_SIZE),
    ROCK_MAX_CONCURRENT_REQUESTS,
    async (batch) => {
      const peopleBatch = await getBounded<AuditPerson>(
        reader,
        '/People',
        {
          $filter: makePeopleFilter(batch),
          $select: 'Id,FirstName,LastName,Email',
        },
        ROCK_PEOPLE_FETCH_LIMIT,
      );
      rawPeople.push(...peopleBatch);
    },
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
    .filter((group) => groupPolicy(group, policyMaps, leaderData.leaderRoleIds).runsheetCampuses.length === 0)
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
