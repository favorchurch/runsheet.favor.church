import 'server-only';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import type { AuthUser } from '@/types/AuthUser';

/**
 * Resolves Rock session data for a page user.
 * Catches Rock failures and surfaces `accessResolutionFailed: true`
 * so the page renders a retry card rather than triggering the Next error boundary.
 */
export async function resolvePageUser(rawUser?: any): Promise<AuthUser> {
  const user = (rawUser || {}) as AuthUser;
  try {
    const rockSession = await getRockSession();
    return {
      ...user,
      sub: String(rockSession.personId),
      contact: rockSession.contact,
      rolesMap: rockSession.rolesMap,
      access: rockSession.access,
      isMinistryTeamVolunteer: rockSession.isMinistryTeamVolunteer,
      accessDiagnostics: rockSession.accessDiagnostics,
    };
  } catch (err) {
    const errorClassName =
      (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string' && err.name) ||
      (err && typeof err === 'object' && err.constructor?.name) ||
      'Error';
    console.warn(`[resolvePageUser] getRockSession failed: ${errorClassName}`);
    const { rolesMap: _unused, ...safeUser } = user;
    return {
      ...safeUser,
      accessResolutionFailed: true,
    };
  }
}
