'use server';

import { getAuthAccess } from './getAuthAccess';

/**
 * Returns campus IDs the user has Department Head access to.
 * Replaces getAuthDepartmentRealms (Fluro realm IDs → Rock campus IDs).
 */
export async function getAuthDepartmentCampuses(): Promise<number[]> {
  try {
    const campuses = (await getAuthAccess()).campusIds;
    if (!(campuses && campuses.length > 0)) {
      throw new Error('no department campuses');
    }
    return campuses.map(Number);
  } catch (err) {
    throw new Error('this section is for department heads or connect team admins only');
  }
}
