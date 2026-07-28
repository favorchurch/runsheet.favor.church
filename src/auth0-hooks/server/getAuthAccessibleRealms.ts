import 'server-only';

import { getAuthAccessibleCampuses } from './getAuthAccessibleCampuses';

/**
 * Get accessible campuses (now campuses) as string IDs.
 * Replaces the Fluro realm-based implementation with Rock campus IDs.
 * Returns string[] for backward compat with UI code that still expects strings.
 */
export async function getAuthAccessibleRealms(): Promise<string[]> {
  const campusIds = await getAuthAccessibleCampuses();
  return campusIds.map(String);
}
