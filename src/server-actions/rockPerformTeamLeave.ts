'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object } from 'zod';

const schema = object({
  groupMemberId: number().int().positive(),
});

export async function rockPerformTeamLeave(groupMemberId: number): Promise<any> {
  await assertAuthenticated();
  schema.parse({ groupMemberId });

  // Resolve the group ID from the group member record
  const groupMember = await rockGet(`/GroupMembers/${groupMemberId}`, { $select: 'GroupId' });
  if (groupMember?.GroupId) {
    await assertAccessibleGroupId(groupMember.GroupId);
  }
  try {
    const result = await rockDelete(`/GroupMembers/${groupMemberId}`);
    revalidateTag('rock:groupmembers');
    await rockClearGroupHierarchyCache();
    return result;
  } catch (err: any) {
    if (err.message.includes('404')) {
      return null;
    }
    console.error('rockPerformTeamLeave ERROR', err);
    throw err;
  }
}
