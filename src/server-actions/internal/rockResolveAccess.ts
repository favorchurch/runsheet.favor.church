import 'server-only';

import { ROCK_API_URL, ROCK_API_KEY, ROCK_FETCH_REVALIDATE_SECONDS } from '@/constants/server';
import { type RunsheetCampusCode } from '@/lib/runsheetCampus';
import {
  GLOBAL_EDIT_GROUP_IDS,
  GROUP_TYPE_23_LEADER_ROLE_IDS,
  resolveRunsheetAccessPolicy,
  type RunsheetPolicyGroup,
} from '@/lib/runsheetAccessPolicy';
import { CAMPUS_MINISTRY_TEAM_ROOT_IDS, CAMPUS_ORG_UNIT_ROOT_IDS } from '@/lib/runsheetAccessRoots';
import { readRockObjectCache, writeRockObjectCache } from '@/server-actions/internal/rockObjectCache';
import { AuthAccess, AuthContact, AuthRolesMap } from '@/types/AuthUser';

const ROCK_RECORD_STATUS_ACTIVE = 3;

export class NoRockPersonError extends Error {
  constructor() {
    super('NO_ROCK_PERSON');
    this.name = 'NoRockPersonError';
  }
}

export class NoAccessError extends Error {
  constructor() {
    super('NO_ACCESS');
    this.name = 'NoAccessError';
  }
}

export class CloudflareBlockError extends Error {
  constructor(path: string) {
    super(`Cloudflare blocked the Rock API request for ${path}.`);
    this.name = 'CloudflareBlockError';
  }
}

function isCloudflareChallenge(response: Response, text: string): boolean {
  if (response.status !== 403) return false;
  const server = response.headers.get('server') || '';
  return (
    server.toLowerCase().includes('cloudflare') ||
    text.includes('Just a moment...') ||
    text.includes('__cf_chl') ||
    text.includes('Enable JavaScript and cookies to continue')
  );
}

async function rawRockGet(path: string, params?: Record<string, string | number | boolean>): Promise<any> {
  const cached = await readRockObjectCache(path, 'GET', params);
  if (cached.hit) {
    return cached.value;
  }

  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
  }
  const queryString = searchParams.toString();
  const fullUrl = `${ROCK_API_URL}${path}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Authorization-Token': ROCK_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'RockRoster/1.0',
    },
    next: {
      revalidate: ROCK_FETCH_REVALIDATE_SECONDS,
      tags: ['rock'],
    },
  });

  const text = await response.text();

  if (!response.ok) {
    if (isCloudflareChallenge(response, text)) {
      throw new CloudflareBlockError(path);
    }
    throw new Error(`Rock API error ${response.status}: ${text}`);
  }

  if (!text || text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text);
    await writeRockObjectCache(path, 'GET', params, parsed);
    return parsed;
  } catch {
    await writeRockObjectCache(path, 'GET', params, text);
    return text;
  }
}

async function fetchPersonById(personId: number) {
  const people = await rawRockGet('/People', {
    $filter: `Id eq ${personId} and RecordStatusValueId eq ${ROCK_RECORD_STATUS_ACTIVE} and IsDeceased eq false`,
    $select: 'Id,FirstName,LastName,NickName,Email,PrimaryCampusId,PrimaryAliasId,RecordStatusValueId',
    $top: 1,
  });

  return (Array.isArray(people) && people.length > 0 ? people[0] : null) as any | null;
}

async function fetchPersonByEmail(email: string) {
  if (!email) return null;
  const escaped = email.replace(/'/g, "''");
  const people = await rawRockGet('/People', {
    $filter: `Email eq '${escaped}' and RecordStatusValueId eq ${ROCK_RECORD_STATUS_ACTIVE} and IsDeceased eq false`,
    $select: 'Id,FirstName,LastName,NickName,Email,PrimaryCampusId,PrimaryAliasId,RecordStatusValueId',
    $top: 1,
  });

  return (Array.isArray(people) && people.length > 0 ? people[0] : null) as any | null;
}

async function fetchTeamMemberships(personId: number) {
  const memberships = (await rawRockGet('/GroupMembers', {
    $filter: `PersonId eq ${personId} and GroupMemberStatus eq '1' and IsArchived eq false`,
    $select: 'Id,GroupId,GroupRoleId,GroupTypeId,GroupMemberStatus',
    $top: 500,
  })) || [];

  return memberships.filter((m: any) => {
    const typeId = Number(m.GroupTypeId);
    const groupId = Number(m.GroupId);
    // Include GroupType 1, Ministry Team (23), Organization Unit (28), and
    // every id-based global grant so the policy module remains authoritative.
    return (
      typeId === 1 ||
      typeId === 23 ||
      typeId === 28 ||
      (GLOBAL_EDIT_GROUP_IDS as readonly number[]).includes(groupId)
    );
  });
}

/** Fetch the group records needed for names and ancestry resolution. */
async function fetchGroupsByType(groupTypeId: number): Promise<Map<number, RunsheetPolicyGroup>> {
  const groups = (await rawRockGet('/Groups', {
    $filter: `GroupTypeId eq ${groupTypeId}`,
    $select: 'Id,GroupTypeId,Name,ParentGroupId',
    $top: 2000,
  })) || [];

  const map = new Map<number, RunsheetPolicyGroup>();
  for (const g of groups) {
    map.set(Number(g.Id), {
      groupId: Number(g.Id),
      groupTypeId: Number(g.GroupTypeId || groupTypeId),
      name: g.Name,
      parentGroupId: g.ParentGroupId != null ? Number(g.ParentGroupId) : null,
    });
  }
  return map;
}

function makeCampusRootMap(
  roots: Record<number, RunsheetCampusCode>,
  groupTypeId: number,
): Map<number, RunsheetPolicyGroup> {
  return new Map(
    Object.entries(roots).map(([groupId, campus]) => {
      const id = Number(groupId);
      return [id, { groupId: id, groupTypeId, parentGroupId: null, campus }] as const;
    }),
  );
}

async function fetchGroupType23LeaderRoleIds(): Promise<{ roleIds: Set<number>; lookupFailed: boolean }> {
  try {
    const roles = await rawRockGet('/GroupTypeRoles', {
      $filter: 'GroupTypeId eq 23',
      $select: 'Id,IsLeader',
      $top: 100,
    });

    if (!Array.isArray(roles) || roles.length === 0) {
      throw new Error('Rock returned no GroupType 23 leader roles');
    }

    const roleIds = new Set(
      roles
        .filter((role: any) => role?.IsLeader === true || String(role?.IsLeader).toLowerCase() === 'true')
        .map((role: any) => Number(role.Id))
        .filter((id: number) => Number.isInteger(id) && id > 0),
    );
    if (roleIds.size === 0) throw new Error('Rock returned no GroupType 23 leader roles');

    return { roleIds, lookupFailed: false };
  } catch (error) {
    console.warn(
      `[runsheet-access] GroupTypeRole.IsLeader lookup failed; using fallback role ids ${GROUP_TYPE_23_LEADER_ROLE_IDS.join(',')}`,
      error,
    );
    return { roleIds: new Set<number>(GROUP_TYPE_23_LEADER_ROLE_IDS), lookupFailed: true };
  }
}

export interface ResolveResult {
  contact: AuthContact;
  rolesMap: AuthRolesMap;
  access: AuthAccess;
}

export async function rockResolveAccess(personId: number, fallbackEmail?: string): Promise<ResolveResult> {
  let person = personId > 0 ? await fetchPersonById(personId) : null;

  if (!person && fallbackEmail) {
    person = await fetchPersonByEmail(fallbackEmail);
  }

  // If still not found, return a valid Volunteer profile rather than throwing NoRockPersonError
  const contact: AuthContact = {
    id: person?.Id ? Number(person.Id) : 0,
    primaryAliasId: person?.PrimaryAliasId != null ? Number(person.PrimaryAliasId) : undefined,
    firstName: person?.FirstName || 'Volunteer',
    lastName: person?.LastName || '',
    nickName: person?.NickName || '',
    fullName:
      person?.FullName ||
      [person?.NickName || person?.FirstName || 'Volunteer', person?.LastName || '']
        .filter(Boolean)
        .join(' ')
        .trim(),
    email: person?.Email || fallbackEmail || '',
    campusId: person?.PrimaryCampusId != null ? Number(person.PrimaryCampusId) : null,
  };

  const campusIds = person?.PrimaryCampusId != null ? [Number(person.PrimaryCampusId)] : [];

  const rolesMap: AuthRolesMap = {};
  const runsheetCampuses = new Set<string>();

  if (person?.Id > 0) {
    const memberships = await fetchTeamMemberships(person.Id);
    const hasGlobalMembership = memberships.some(
      (m: any) =>
        Number(m.GroupTypeId) === 1 ||
        (GLOBAL_EDIT_GROUP_IDS as readonly number[]).includes(Number(m.GroupId)),
    );
    const hasOrgUnitMembership = memberships.some((m: any) => Number(m.GroupTypeId) === 28);
    const hasMinistryTeamMembership = memberships.some((m: any) => Number(m.GroupTypeId) === 23);

    // Only fetched when actually needed - most sessions hit the group-type
    // caches from `rockObjectCache` anyway, but this skips the round trip
    // entirely for a person with no membership of that type at all.
    const [globalGroups, orgUnitGroups, ministryTeamGroups, leaderRoles] = await Promise.all([
      hasGlobalMembership ? fetchGroupsByType(1) : Promise.resolve(new Map<number, RunsheetPolicyGroup>()),
      hasOrgUnitMembership ? fetchGroupsByType(28) : Promise.resolve(new Map<number, RunsheetPolicyGroup>()),
      hasMinistryTeamMembership ? fetchGroupsByType(23) : Promise.resolve(new Map<number, RunsheetPolicyGroup>()),
      hasMinistryTeamMembership
        ? fetchGroupType23LeaderRoleIds()
        : Promise.resolve({ roleIds: new Set<number>(), lookupFailed: false }),
    ]);

    const groups = new Map<number, RunsheetPolicyGroup>([
      ...globalGroups,
      ...orgUnitGroups,
      ...ministryTeamGroups,
    ]);
    // These declared roots are authoritative even when Rock's GroupType
    // endpoint omits a root. Keep the maps separate from fetched groups so a
    // missing root cannot silently erase a user's campus scope.
    const campusRoots = new Map<number, RunsheetPolicyGroup>([
      ...makeCampusRootMap(CAMPUS_ORG_UNIT_ROOT_IDS, 28),
      ...makeCampusRootMap(CAMPUS_MINISTRY_TEAM_ROOT_IDS, 23),
    ]);
    const policy = resolveRunsheetAccessPolicy(
      memberships.map((m: any) => ({
        groupId: Number(m.GroupId),
        groupTypeId: Number(m.GroupTypeId),
        groupRoleId: Number(m.GroupRoleId),
      })),
      groups,
      campusRoots,
      leaderRoles.roleIds,
      leaderRoles.lookupFailed,
    );

    if (policy.editorGroupIds.length > 0) rolesMap.editor = policy.editorGroupIds;
    if (policy.viewerGroupIds.length > 0) rolesMap.viewer = policy.viewerGroupIds;
    for (const campus of policy.runsheetCampuses) runsheetCampuses.add(campus);
  }

  // Deduplicate group IDs
  for (const key in rolesMap) {
    rolesMap[key] = [...new Set(rolesMap[key])];
  }

  return {
    contact,
    rolesMap,
    access: {
      campusIds,
      connectLeaderGroupIds: [],
      regionalLeaderSections: [],
      clusterHeadSections: [],
      departmentHeadSections: [],
      runsheetCampuses: Array.from(runsheetCampuses),
    },
  };
}
