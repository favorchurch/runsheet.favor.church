import 'server-only';

import { ConnectRole } from '@/types/ConnectRole';
import { getRockSession, NoAccessError } from './getRockSession';

export async function checkAuthHasRole(
  role: ConnectRole | ConnectRole[],
): Promise<boolean> {
  const acceptedRoles = Array.isArray(role) ? role : [role];
  if (!acceptedRoles.length) return false;

  try {
    const { rolesMap } = await getRockSession();

    return acceptedRoles.some((entry) => {
      const ids = rolesMap?.[entry];
      return Array.isArray(ids) && ids.length > 0;
    });
  } catch (error) {
    if (error instanceof NoAccessError) {
      return false;
    }
    throw error;
  }
}
