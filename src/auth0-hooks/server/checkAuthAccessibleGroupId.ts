import 'server-only';

import { getAuthAccessibleGroupsIds } from './getAuthAccessibleGroupsIds';

export async function checkAuthAccessibleGroupId(groupId: number) {
  if (!groupId || typeof groupId !== 'number') {
    throw new Error('Invalid group ID');
  }

  try {
    const accessibleGroupIds = await getAuthAccessibleGroupsIds();
    return accessibleGroupIds.includes(groupId);
  } catch (err) {
    console.error('checkAuthAccessibleGroupId', groupId, err);
    throw err;
  }
}
