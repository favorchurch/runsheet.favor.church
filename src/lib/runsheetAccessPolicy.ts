import { ALL_CAMPUSES, type RunsheetCampusCode } from './runsheetCampus';

/** Group ids that grant runsheet edit access across every campus. */
export const GLOBAL_EDIT_GROUP_IDS = [2, 46, 32879, 4, 5] as const;

/** Rock group types that grant campus-scoped runsheet edit access. */
export const CAMPUS_EDIT_GROUP_TYPE_IDS = [28] as const;

/** Rock group types that grant campus-scoped runsheet view access. */
export const CAMPUS_VIEW_GROUP_TYPE_IDS = [23] as const;

/** Group names ending this way are Events Teams; only their leaders may edit. */
export const EVENTS_TEAM_NAME_PATTERN = /events team$/i;

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
  runsheetCampuses: string[];
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
  leaderRoleIds: LeaderRoleIds = new Set<number>(),
  leaderRoleLookupFailed = false,
): RunsheetAccessPolicyResult {
  const editorGroupIds: string[] = [];
  const viewerGroupIds: string[] = [];
  const runsheetCampuses: string[] = [];

  for (const membership of memberships) {
    const group = groups.get(membership.groupId);
    const isGlobal = isGlobalEditGroup(membership, group);
    const isCampusEditor = (CAMPUS_EDIT_GROUP_TYPE_IDS as readonly number[]).includes(membership.groupTypeId);
    const isMinistryMember = (CAMPUS_VIEW_GROUP_TYPE_IDS as readonly number[]).includes(membership.groupTypeId);
    const isEventsTeam = Boolean(group?.name && EVENTS_TEAM_NAME_PATTERN.test(group.name.trim()));
    const isLeader = leaderRoleLookupFailed
      ? GROUP_TYPE_23_LEADER_ROLE_IDS.includes(membership.groupRoleId as (typeof GROUP_TYPE_23_LEADER_ROLE_IDS)[number])
      : leaderRoleIds.has(Number(membership.groupRoleId));
    const canEdit = isGlobal || isCampusEditor || (isMinistryMember && isEventsTeam && isLeader);
    const canView = isGlobal || isCampusEditor || isMinistryMember;

    if (!canView) continue;

    if (isGlobal) {
      // Every global match, including Dashboard Creator and WEB roles, must
      // carry the cross-campus scope or its edit role would see nothing.
      if (!runsheetCampuses.includes(ALL_CAMPUSES)) runsheetCampuses.push(ALL_CAMPUSES);
    } else if (isCampusEditor || isMinistryMember) {
      const campus = resolveCampusFromAncestry(membership.groupId, membership.groupTypeId, groups, campusRoots);
      if (campus && !runsheetCampuses.includes(campus)) runsheetCampuses.push(campus);
    }

    if (canEdit) addUnique(editorGroupIds, membership.groupId);
    addUnique(viewerGroupIds, membership.groupId);
  }

  return { editorGroupIds, viewerGroupIds, runsheetCampuses, usedLeaderRoleFallback: leaderRoleLookupFailed };
}

export { ALL_CAMPUSES };
