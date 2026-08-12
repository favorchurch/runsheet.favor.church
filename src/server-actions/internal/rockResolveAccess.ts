import 'server-only';

import { ROCK_API_URL, ROCK_API_KEY, ROCK_FETCH_REVALIDATE_SECONDS } from '@/constants/server';
import { ALL_CAMPUSES, type RunsheetCampusCode } from '@/lib/runsheetCampus';
import { readRockObjectCache, writeRockObjectCache } from '@/server-actions/internal/rockObjectCache';
import { AuthAccess, AuthContact, AuthRolesMap } from '@/types/AuthUser';

const ROCK_RECORD_STATUS_ACTIVE = 3;

/**
 * Group 46 "Global Staff" (Rock's own description: "Membership here
 * AUTOMATICALLY grants cross-campus view... Access does NOT cascade from the
 * campus groups below; only people added directly to THIS group are global
 * staff") and Group 2 "RSR - Rock Administration" are the only two groups
 * whose membership bypasses campus isolation entirely.
 */
const GLOBAL_STAFF_GROUP_ID = 46;
const ROCK_ADMINISTRATION_GROUP_ID = 2;

/**
 * Rock's own per-campus organizational folders under Global Staff (Group
 * Type 28) — "Manila" (32893), "Brisbane" (32898), "Seoul" (32902). These
 * folders grant no access by themselves; a membership's *specific* staff
 * role group (e.g. "MNL Staff") is a descendant of one of these, and that
 * ancestry is what tells us which campus the role belongs to.
 */
const CAMPUS_ORG_UNIT_ROOT_IDS: Record<number, RunsheetCampusCode> = {
  32893: 'MNL',
  32898: 'BNE',
  32902: 'SEL',
};

/** Rock's per-campus Ministry Team (Group Type 23) roots under "Ministry Teams" (56). */
const CAMPUS_MINISTRY_TEAM_ROOT_IDS: Record<number, RunsheetCampusCode> = {
  57: 'MNL',
  59: 'BNE',
  58: 'SEL',
};

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
    $filter: `PersonId eq ${personId} and GroupMemberStatus eq '1'`,
    $select: 'Id,GroupId,GroupRoleId,GroupTypeId,GroupMemberStatus',
    $top: 500,
  })) || [];

  return memberships.filter((m: any) => {
    const typeId = Number(m.GroupTypeId);
    const groupId = Number(m.GroupId);
    // Include Ministry Team (23), Organization Unit (28), and RSR - Rock Administration (Group 2)
    return typeId === 23 || typeId === 28 || groupId === 2;
  });
}

/** Id -> ParentGroupId for every group of one Group Type, to walk a membership's ancestry. */
async function fetchGroupParentMap(groupTypeId: number): Promise<Map<number, number | null>> {
  const groups = (await rawRockGet('/Groups', {
    $filter: `GroupTypeId eq ${groupTypeId}`,
    $select: 'Id,ParentGroupId',
    $top: 2000,
  })) || [];

  const map = new Map<number, number | null>();
  for (const g of groups) {
    map.set(Number(g.Id), g.ParentGroupId != null ? Number(g.ParentGroupId) : null);
  }
  return map;
}

/** Walks a group's ancestry up to whichever known campus root it descends from, if any. */
function resolveCampusFromAncestry(
  groupId: number,
  parentMap: Map<number, number | null>,
  roots: Record<number, RunsheetCampusCode>,
): RunsheetCampusCode | null {
  let current: number | null = groupId;
  const seen = new Set<number>();

  while (current !== null && !seen.has(current)) {
    if (roots[current]) return roots[current];
    seen.add(current);
    current = parentMap.get(current) ?? null;
  }

  return null;
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
    const hasOrgUnitMembership = memberships.some((m: any) => Number(m.GroupTypeId) === 28);
    const hasMinistryTeamMembership = memberships.some((m: any) => Number(m.GroupTypeId) === 23);

    // Only fetched when actually needed - most sessions hit the group-type
    // caches from `rockObjectCache` anyway, but this skips the round trip
    // entirely for a person with no membership of that type at all.
    const [orgUnitParentMap, ministryTeamParentMap] = await Promise.all([
      hasOrgUnitMembership ? fetchGroupParentMap(28) : Promise.resolve(new Map<number, number | null>()),
      hasMinistryTeamMembership ? fetchGroupParentMap(23) : Promise.resolve(new Map<number, number | null>()),
    ]);

    for (const m of memberships) {
      const typeId = Number(m.GroupTypeId);
      const roleId = Number(m.GroupRoleId);
      const groupId = Number(m.GroupId);

      let canEdit = false;
      let canView = false;

      // Edit conditions
      if (groupId === ROCK_ADMINISTRATION_GROUP_ID) canEdit = true;
      if (groupId === GLOBAL_STAFF_GROUP_ID) canEdit = true;
      if (typeId === 28) canEdit = true;
      if ((roleId === 55 || roleId === 20) && groupId === 19109) canEdit = true;

      // View conditions
      if (typeId === 23) canView = true;
      if (canEdit) canView = true;

      // Campus isolation: Rock Administration and Global Staff see every
      // campus; everyone else's scope comes from which campus's staff
      // org-unit folder or ministry-team tree their specific role group
      // descends from (see the root-id maps above).
      if (groupId === ROCK_ADMINISTRATION_GROUP_ID || groupId === GLOBAL_STAFF_GROUP_ID) {
        runsheetCampuses.add(ALL_CAMPUSES);
      }
      if (typeId === 28) {
        const campus = resolveCampusFromAncestry(groupId, orgUnitParentMap, CAMPUS_ORG_UNIT_ROOT_IDS);
        if (campus) runsheetCampuses.add(campus);
      }
      if (typeId === 23) {
        const campus = resolveCampusFromAncestry(groupId, ministryTeamParentMap, CAMPUS_MINISTRY_TEAM_ROOT_IDS);
        if (campus) runsheetCampuses.add(campus);
      }

      if (canEdit) {
        if (!rolesMap['editor']) rolesMap['editor'] = [];
        rolesMap['editor'].push(String(groupId));
      }

      if (canView) {
        if (!rolesMap['viewer']) rolesMap['viewer'] = [];
        rolesMap['viewer'].push(String(groupId));
      }
    }
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
