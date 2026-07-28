import 'server-only';

import { checkAuthAccessibleClusterSectionId } from './checkAuthAccessibleClusterSectionId';

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Asserts the current user can view the given cluster section.
 * Throws ForbiddenError otherwise.
 */
export async function assertAccessibleClusterSectionId(sectionId: number): Promise<void> {
  const hasAccess = await checkAuthAccessibleClusterSectionId(sectionId);
  if (!hasAccess) {
    throw new ForbiddenError(`Access denied to cluster section ${sectionId}`);
  }
}
