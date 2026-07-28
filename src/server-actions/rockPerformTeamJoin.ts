'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { RockGroupMember, RockGroupRoleId } from '@/types/RockGroupMember';
import { number, object } from 'zod';

export interface RockTeamJoinPayload {
  groupId: number;
  personId: number;
  groupRoleId?: number;
}

const schema = object({
  groupId: number().int().positive(),
  personId: number().int().positive(),
  groupRoleId: number().int().positive().optional(),
});

export async function rockPerformTeamJoin({
  groupId,
  personId,
  groupRoleId,
}: RockTeamJoinPayload): Promise<RockGroupMember> {
  await assertAuthenticated();
  schema.parse({ groupId, personId, groupRoleId });
  await assertAccessibleGroupId(groupId);

  const body: Record<string, any> = {
    GroupId: groupId,
    PersonId: personId,
    GroupMemberStatus: 1, // Active
    GroupRoleId: groupRoleId ?? RockGroupRoleId.ConnectGroupMember,
  };

  try {
    const result = await rockPost('/GroupMembers', body);
    revalidateTag('rock:groupmembers');
    await rockClearGroupHierarchyCache();
    return result;
  } catch (err: any) {
    if (err.message.includes('400') && err.message.includes('already belongs')) {
      return {} as any;
    }
    console.error('rockPerformTeamJoin ERR', err);
    throw err;
  }
}
