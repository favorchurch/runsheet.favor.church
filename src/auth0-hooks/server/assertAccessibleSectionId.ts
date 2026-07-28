import 'server-only';

import { checkAuthAccessibleClusterSectionId } from './checkAuthAccessibleClusterSectionId';
import { checkAuthAccessibleRegionalSectionId } from './checkAuthAccessibleRegionalSectionId';

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Asserts the current user can view the given section (cluster or region).
 * Throws ForbiddenError otherwise.
 */
export async function assertAccessibleSectionId(sectionId: number): Promise<void> {
  const [cluster, regional] = await Promise.all([
    checkAuthAccessibleClusterSectionId(sectionId),
    checkAuthAccessibleRegionalSectionId(sectionId),
  ]);
  if (!cluster && !regional) {
    throw new ForbiddenError(`Access denied to section ${sectionId}`);
  }
}
