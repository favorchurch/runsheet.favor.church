'use server';

import { AuthUser } from '@/types/AuthUser';
import { getServerSession } from './getServerSession';
import { getRockSession } from './getRockSession';

/**
 * Get the authenticated user with Rock session data merged in.
 * Falls back to raw Auth0 user if Rock resolution fails.
 */
export async function getSessionUser(): Promise<AuthUser> {
  const session = await getServerSession();
  if (!session?.user) throw new Error('no user session');
  const user = session.user as AuthUser;
  try {
    const rockSession = await getRockSession();
    return {
      ...user,
      sub: String(rockSession.personId),
      contact: rockSession.contact,
      rolesMap: rockSession.rolesMap,
      access: rockSession.access,
      isMinistryTeamVolunteer: rockSession.isMinistryTeamVolunteer,
      rosterLookupFailed: rockSession.rosterLookupFailed ?? rockSession.accessDiagnostics?.rosterLookupFailed,
      accessDiagnostics: rockSession.accessDiagnostics,
    };
  } catch (err) {
    const errorClassName =
      (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string' && err.name) ||
      (err && typeof err === 'object' && err.constructor?.name) ||
      'Error';
    console.warn(`[getSessionUser] getRockSession failed: ${errorClassName}`);
    const { rolesMap: _unused, ...safeUser } = user;
    return {
      ...safeUser,
      accessResolutionFailed: true,
    };
  }
}
