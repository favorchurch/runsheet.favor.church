import 'server-only';

import { checkAuthAccessibleGroupId } from './checkAuthAccessibleGroupId';

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Asserts that the current authenticated user has access to the specified group.
 * Throws ForbiddenError if the group is not accessible.
 */
export async function assertAccessibleGroupId(groupId: number): Promise<void> {
  const hasAccess = await checkAuthAccessibleGroupId(groupId);
  if (!hasAccess) {
    throw new ForbiddenError(`Access denied to group ${groupId}`);
  }
}
