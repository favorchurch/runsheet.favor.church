'use server';

import { getAuthDepartmentCampuses } from './getAuthDepartmentCampuses';

/**
 * Make sure to wrap parent component with "withPageAuthRequired"
 */
export async function getAuthDepartmentRealms(): Promise<string[]> {
  try {
    const campuses = await getAuthDepartmentCampuses();
    if (!(campuses && campuses.length > 0)) {
      throw new Error('no department campuses');
    }
    return campuses.map(String);
  } catch (err) {
    throw new Error('this section is for department heads or connect team admins only');
  }
}
