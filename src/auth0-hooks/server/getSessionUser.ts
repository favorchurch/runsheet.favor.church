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
      contact: rockSession.contact,
      rolesMap: rockSession.rolesMap,
      access: rockSession.access,
    };
  } catch (err) {
    console.warn('[getSessionUser] getRockSession failed:', err);
    return user;
  }
}
