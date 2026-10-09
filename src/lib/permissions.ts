import type { AuthRolesMap, AuthUser } from '@/types/AuthUser';

interface HasRolesMap {
  rolesMap?: AuthRolesMap;
}

/** Grow Course Heads: may create/edit Grow runsheets only. */
export const GROW_EDITOR_ROLE = 'growEditor';
/** Rostered Grow volunteers: values are `scheduleId:YYYY-MM-DD` occurrence keys. */
export const GROW_VIEWER_ROLE = 'growViewer';
/** Rostered volunteers: values are `[kids:]<campus>:<YYYY-MM-DD>:<HH:MM:SS>` roster keys. */
export const ROSTERED_VIEWER_ROLE = 'rosteredViewer';

function hasRole(user: HasRolesMap | AuthUser | null | undefined, role: string): boolean {
  return Boolean(user?.rolesMap?.[role]?.length);
}

/** Campus/global runsheet editor, as opposed to a Grow-only editor. */
export function hasFullEditorRole(user?: HasRolesMap | AuthUser | null): boolean {
  return hasRole(user, 'editor');
}

export function hasGrowRole(user?: HasRolesMap | AuthUser | null): boolean {
  return hasRole(user, GROW_EDITOR_ROLE) || hasRole(user, GROW_VIEWER_ROLE);
}

/**
 * Check if a user has edit access to at least some runsheets. Which channels
 * they may edit is decided per title by `canEditRunsheetChannel`.
 */
export function canUserEditRunsheet(user?: HasRolesMap | AuthUser | null): boolean {
  return hasFullEditorRole(user) || hasRole(user, GROW_EDITOR_ROLE);
}

/**
 * Check if a user is eligible to view or access runsheets.
 * If user has no assigned roles/permissions, returns false so they can be gated.
 */
export function canUserAccessRunsheet(user?: HasRolesMap | AuthUser | null): boolean {
  return (
    canUserEditRunsheet(user) ||
    hasRole(user, 'viewer') ||
    hasRole(user, GROW_VIEWER_ROLE) ||
    hasRole(user, ROSTERED_VIEWER_ROLE)
  );
}

export type AccessGateState =
  | 'allowed'
  | 'resolution-failed'
  | 'volunteer-landing'
  | 'ineligible';

/**
 * Determine gate access state for a user.
 *
 * - 'allowed': User holds a runsheet role (editor, viewer, growEditor, growViewer, rosteredViewer).
 *   Holds 'allowed' even if rosterLookupFailed is true.
 * - 'resolution-failed': User has no runsheet role, but either access resolution failed
 *   or roster lookup failed (which could be hiding real rostered access).
 *   Takes precedence over volunteer-landing or ineligible.
 * - 'volunteer-landing': User has an active Ministry Team membership but is not currently rostered.
 * - 'ineligible': User has no permissions, no volunteer status, and no failed lookups.
 */
export function getAccessGateState(user?: AuthUser | null): AccessGateState {
  if (canUserAccessRunsheet(user)) {
    return 'allowed';
  }

  const isFailed = Boolean(
    user?.accessResolutionFailed ||
    user?.rosterLookupFailed ||
    user?.accessDiagnostics?.rosterLookupFailed
  );

  if (isFailed) {
    return 'resolution-failed';
  }

  const isVolunteer = Boolean(
    user?.isMinistryTeamVolunteer ||
    user?.access?.isMinistryTeamVolunteer
  );

  if (isVolunteer) {
    return 'volunteer-landing';
  }

  return 'ineligible';
}

