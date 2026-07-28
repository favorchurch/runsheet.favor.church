import 'server-only';

import { ConnectRole } from '@/types/ConnectRole';
import { checkAuthHasRole } from './checkAuthHasRole';

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function assertHasRole(
  role: ConnectRole | ConnectRole[],
): Promise<void> {
  const acceptedRoles = Array.isArray(role) ? role : [role];
  const hasRole = await checkAuthHasRole(acceptedRoles);

  if (!hasRole) {
    throw new ForbiddenError(
      `Missing required role: ${acceptedRoles.join(', ')}`,
    );
  }
}
