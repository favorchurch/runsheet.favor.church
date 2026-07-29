import type { AuthUser } from '@/types/AuthUser';

/**
 * Check if a user has edit access to runsheets.
 */
export function canUserEditRunsheet(user?: AuthUser | null): boolean {
  if (!user) return false;

  if (user.rolesMap && user.rolesMap['editor'] && user.rolesMap['editor'].length > 0) {
    return true;
  }

  return false;
}

/**
 * Check if a user is eligible to view or access runsheets.
 * If user has no assigned roles/permissions, returns false so they can be gated.
 */
export function canUserAccessRunsheet(user?: AuthUser | null): boolean {
  if (!user) return false;

  if (user.rolesMap && user.rolesMap['viewer'] && user.rolesMap['viewer'].length > 0) {
    return true;
  }

  return false;
}
