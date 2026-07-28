import 'server-only';

import { checkAuthAccessibleRegionalSectionId } from './checkAuthAccessibleRegionalSectionId';

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Asserts the current user can view the given region section.
 * Throws ForbiddenError otherwise.
 */
export async function assertAccessibleRegionalSectionId(sectionId: number): Promise<void> {
  const hasAccess = await checkAuthAccessibleRegionalSectionId(sectionId);
  if (!hasAccess) {
    throw new ForbiddenError(`Access denied to region section ${sectionId}`);
  }
}
