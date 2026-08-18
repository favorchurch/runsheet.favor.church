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
  if (!email || !email.trim()) return null;
  const escaped = email.trim().replace(/'/g, "''");
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
    const typeId = Number(m.GroupTypeId ?? m.groupTypeId);
    const groupId = Number(m.GroupId ?? m.groupId);
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
  /**
   * Set when a secondary (non-primary) id in the union failed its
   * `fetchPersonById` validity fetch (network/API error, not a plain
   * not-found). A partial result must never be written to the session
   * cache — see `getRockSession`.
   */
  partial?: boolean;
}

/**
 * Matches the Auth0 Post-Login Action's `PERSON_FETCH_LIMIT`
 * (`~/Git/rock-auth0/src/common/person-match.js`). Truncation always keeps
 * `personIds[0]` (the primary/identity id) and drops from the tail.
 */
export const MAX_UNION_PERSON_IDS = 11;

/**
 * Resolve runsheet authorization by unioning Rock group memberships across
 * every id in `personIds`. **Identity is primary-only:** `contact` (name,
 * email, campusId, primaryAliasId) always resolves from `personIds[0]` alone
 * — the union changes authorization, never who the signed-in person is.
 * Callers (see `getRockSession`) are responsible for ordering `personIds`
 * with the primary id first.
 */
export async function rockResolveAccess(personIds: number[], fallbackEmail?: string): Promise<ResolveResult> {
  const truncate = personIds.length > MAX_UNION_PERSON_IDS;
  const capped = truncate ? personIds.slice(0, MAX_UNION_PERSON_IDS) : personIds;
  if (truncate) {
    console.warn(
      `[runsheet-access] truncating union person ids from ${personIds.length} to ${MAX_UNION_PERSON_IDS}, retaining primary id ${capped[0]}`,
    );
  }

  const primaryId = capped[0] ?? 0;

  // Primary-id failures propagate (unreached here — fetchPersonById below is
  // not wrapped in try/catch), preserving today's behavior including
  // CloudflareBlockError surfacing to the caller.
  let person = primaryId > 0 ? await fetchPersonById(primaryId) : null;

  // Whether `person` is still the primary id we were asked to resolve. When the
  // primary fails its validity filter and the email fallback resolves someone
  // else (another household member on the same address), identity is no longer
  // `personIds[0]`, so the union must NOT be applied on top of that stranger's
  // profile — otherwise "identity is primary-only" quietly stops holding.
  const primaryResolved = person?.Id != null && Number(person.Id) === primaryId;

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

  const campusIds: number[] = person?.PrimaryCampusId != null ? [Number(person.PrimaryCampusId)] : [];

  // Defensive per-id filter for <=0/non-integer stays as defence-in-depth:
  // it is unreachable via `parseRockPersonIds`' all-or-nothing gate upstream,
  // but a future caller of this exported function should not be able to
  // smuggle a malformed id into a Rock query.
  const secondaryIds = (primaryResolved ? [...new Set(capped.slice(1))] : []).filter(
    (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0 && id !== primaryId,
  );

  let partial = false;
  const membershipPersonIds: number[] = [];
  // The person whose identity this session carries — the primary id normally,
  // or the email-fallback person when the primary failed validity. Their fetches
  // are the signed-in user's own, so their failures propagate; `primaryId` alone
  // is the wrong comparand here because it is 0 on the pure email-fallback path.
  const identityPersonId = person?.Id != null && Number(person.Id) > 0 ? Number(person.Id) : 0;
  if (identityPersonId > 0) {
    membershipPersonIds.push(identityPersonId);
  }

  for (const secondaryId of secondaryIds) {
    try {
      const secondaryPerson = await fetchPersonById(secondaryId);
      if (secondaryPerson?.Id > 0) {
        membershipPersonIds.push(Number(secondaryPerson.Id));
        if (secondaryPerson.PrimaryCampusId != null) {
          campusIds.push(Number(secondaryPerson.PrimaryCampusId));
        }
      }
      // else: dropped by the validity filter (inactive/deceased/merged away)
      // — not a failure, so `partial` is not set.
    } catch (error) {
      partial = true;
      console.warn(
        `[runsheet-access] secondary person id ${secondaryId} failed its validity fetch; dropping from the union`,
        error,
      );
    }
  }

  const rolesMap: AuthRolesMap = {};
  const runsheetCampuses = new Set<string>();

  if (membershipPersonIds.length > 0) {
    // The primary's membership fetch propagates (its failure is the signed-in
    // user's own failure). A SECONDARY's must not: a transient Rock error on a
    // household member's /GroupMembers query would otherwise deny the primary
    // user their entire session. Drop that id and mark the resolve partial, per
    // T1's error policy.
    const membershipLists = await Promise.all(
      membershipPersonIds.map(async (id) => {
        if (id === identityPersonId) {
          return fetchTeamMemberships(id);
        }
        try {
          return await fetchTeamMemberships(id);
        } catch (error) {
          partial = true;
          console.warn(
            `[runsheet-access] secondary person id ${id} failed its membership fetch; dropping from the union`,
            error,
          );
          return [];
        }
      }),
    );
    const memberships = membershipLists.flat();
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
        groupId: Number(m.GroupId ?? m.groupId),
        groupTypeId: Number(m.GroupTypeId ?? m.groupTypeId),
        groupRoleId: Number(m.GroupRoleId ?? m.groupRoleId),
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
      campusIds: [...new Set(campusIds)],
      connectLeaderGroupIds: [],
      regionalLeaderSections: [],
      clusterHeadSections: [],
      departmentHeadSections: [],
      runsheetCampuses: Array.from(runsheetCampuses),
    },
    ...(partial ? { partial: true } : {}),
  };
}
