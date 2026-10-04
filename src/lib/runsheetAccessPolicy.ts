import { ALL_CAMPUSES, type RunsheetCampusCode } from './runsheetCampus';

/** Group ids that grant runsheet edit access across every campus. */
export const GLOBAL_EDIT_GROUP_IDS = [2, 46, 32879, 4, 5] as const;

/** Rock group types that grant campus-scoped runsheet edit access. */
export const CAMPUS_EDIT_GROUP_TYPE_IDS = [28] as const;

/** Rock group types that grant campus-scoped runsheet view access. */
export const CAMPUS_VIEW_GROUP_TYPE_IDS = [23] as const;

/** Group names ending this way are Events Teams; they get a campus-wide view. */
export const EVENTS_TEAM_NAME_PATTERN = /events team$/i;

/** GroupType 23 roles that may edit their Events Team's campus runsheets (20 = Overall Head, 55 = Unit Head). */
export const EVENTS_TEAM_EDITOR_ROLE_IDS = [20, 55] as const;

/** Deaf Ministry teams; their Overall Heads and Unit Heads get a campus-wide view (never edit). */
export const DEAF_MINISTRY_NAME_PATTERN = /deaf ministry$/i;

/** GroupType 23 roles that may view their Deaf Ministry's campus runsheets (20 = Overall Head, 55 = Unit Head). */
export const DEAF_MINISTRY_VIEWER_ROLE_IDS = [20, 55] as const;

/**
 * Department Admins live in Rock's "Access" tree (GroupType 28), outside the
 * Org Chart campus roots. They get a view-only scope: their own campus, or
 * every campus for GLB.
 */
export const DEPARTMENT_ADMIN_VIEW_GROUPS: Readonly<Record<number, RunsheetCampusCode | typeof ALL_CAMPUSES>> = {
  57919: 'MNL',
  57920: 'BNE',
  57921: 'SEL',
  103375: ALL_CAMPUSES,
};

/** Fallback only: Rock's GroupTypeRole.IsLeader lookup is authoritative. */
export const GROUP_TYPE_23_LEADER_ROLE_IDS = [20, 55, 69, 75] as const;

export interface RunsheetPolicyMembership {
  groupId: number;
  groupTypeId: number;
  groupRoleId?: number;
}

export interface RunsheetPolicyGroup {
  groupId: number;
  groupTypeId: number;
  name?: string;
  parentGroupId?: number | null;
  campus?: RunsheetCampusCode | null;
}

export interface RunsheetAccessPolicyResult {
  editorGroupIds: string[];
  viewerGroupIds: string[];
  /** Campuses the user may view. */
  runsheetCampuses: string[];
  /** Campuses the user may edit; always a subset of `runsheetCampuses`. */
  runsheetEditCampuses: string[];
  usedLeaderRoleFallback: boolean;
}

type PolicyGroupMap = ReadonlyMap<number, RunsheetPolicyGroup>;
type LeaderRoleIds = ReadonlySet<number>;

function isGlobalEditGroup(membership: RunsheetPolicyMembership, group?: RunsheetPolicyGroup): boolean {
  return (
    (GLOBAL_EDIT_GROUP_IDS as readonly number[]).includes(membership.groupId) ||
    (membership.groupTypeId === 1 && group?.name?.trim().toLowerCase() === 'glb | web developer')
  );
}

function resolveCampusFromAncestry(
  groupId: number,
  groupTypeId: number,
  groups: PolicyGroupMap,
  campusRoots: PolicyGroupMap,
): RunsheetCampusCode | null {
  let current: number | null = groupId;
  const seen = new Set<number>();

  while (current !== null && !seen.has(current)) {
    const group: RunsheetPolicyGroup | undefined = [campusRoots.get(current), groups.get(current)].find(
      (candidate) => candidate?.groupTypeId === groupTypeId,
    );
    if (group?.campus) return group.campus;
    seen.add(current);
    current = group?.parentGroupId ?? null;
  }

  return null;
}

function addUnique(target: string[], groupId: number): void {
  const value = String(groupId);
  if (!target.includes(value)) target.push(value);
}

/**
 * Apply the runsheet authorization table to Rock membership records.
 *
 * The resolver supplies group names, ancestry and the authoritative leader-role
 * set. This function intentionally has no Rock or session dependencies so each
 * access row can be tested without credentials or network calls.
 */
export function resolveRunsheetAccessPolicy(
  memberships: readonly RunsheetPolicyMembership[],
  groups: PolicyGroupMap,
  campusRoots: PolicyGroupMap,
  _leaderRoleIds: LeaderRoleIds = new Set<number>(),
  leaderRoleLookupFailed = false,
): RunsheetAccessPolicyResult {
  const editorGroupIds: string[] = [];
  const viewerGroupIds: string[] = [];
  const runsheetCampuses: string[] = [];
  const runsheetEditCampuses: string[] = [];
  const addCampus = (target: string[], campus: string) => {
    if (!target.includes(campus)) target.push(campus);
  };

  for (const membership of memberships) {
    const group = groups.get(membership.groupId);
    const roleId = Number(membership.groupRoleId);
    const isMinistryMember = (CAMPUS_VIEW_GROUP_TYPE_IDS as readonly number[]).includes(membership.groupTypeId);
    const isOrgUnit = (CAMPUS_EDIT_GROUP_TYPE_IDS as readonly number[]).includes(membership.groupTypeId);
    const groupName = group?.name?.trim() || '';
    const isEventsTeam = isMinistryMember && EVENTS_TEAM_NAME_PATTERN.test(groupName);
    // Matched by group id alone: Rock can keep a stale GroupTypeId on the
    // membership row (e.g. 1 instead of 28 for MNL Department Admins).
    const departmentAdminScope = DEPARTMENT_ADMIN_VIEW_GROUPS[membership.groupId];

    let campus: string | null = null;
    let canEdit = false;

    if (isGlobalEditGroup(membership, group)) {
      // Every global match, including Dashboard Creator and WEB roles, must
      // carry the cross-campus scope or its edit role would see nothing.
      campus = ALL_CAMPUSES;
      canEdit = true;
    } else if (departmentAdminScope) {
      campus = departmentAdminScope;
    } else if (isOrgUnit) {
      // Org Chart staff edit their own campus. A GroupType 28 group outside
      // the campus roots (e.g. the "Access" tree) grants nothing.
      campus = resolveCampusFromAncestry(membership.groupId, membership.groupTypeId, groups, campusRoots);
      canEdit = true;
    } else if (isMinistryMember) {
      // Ministry Teams no longer get blanket access: Events Teams keep a
      // campus-wide view (Overall/Unit Heads edit it), and Deaf Ministry
      // Overall/Unit Heads get a campus-wide view. Everyone else sees the
      // runsheets they are rostered on (see lib/rosterAccess).
      const isDeafMinistryViewer =
        DEAF_MINISTRY_NAME_PATTERN.test(groupName) &&
        (DEAF_MINISTRY_VIEWER_ROLE_IDS as readonly number[]).includes(roleId);
      if (isEventsTeam || isDeafMinistryViewer) {
        campus = resolveCampusFromAncestry(membership.groupId, membership.groupTypeId, groups, campusRoots);
        canEdit = isEventsTeam && (EVENTS_TEAM_EDITOR_ROLE_IDS as readonly number[]).includes(roleId);
      }
    }

    if (!campus) continue;

    addCampus(runsheetCampuses, campus);
    addUnique(viewerGroupIds, membership.groupId);
    if (canEdit) {
      addCampus(runsheetEditCampuses, campus);
      addUnique(editorGroupIds, membership.groupId);
    }
  }

  return {
    editorGroupIds,
    viewerGroupIds,
    runsheetCampuses,
    runsheetEditCampuses,
    usedLeaderRoleFallback: leaderRoleLookupFailed,
  };
}

export { ALL_CAMPUSES };
