'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { RockGroupMember } from '@/types/RockGroupMember';
import { number, object } from 'zod';

const schema = object({
  groupId: number().int().positive(),
});

export async function rockGetConnectById(groupId: number): Promise<RockGroup> {
  await assertAuthenticated();
  schema.parse({ groupId });

  const [group, members] = await Promise.all([
    rockGet(`/Groups/${groupId}`, {
      $expand: 'GroupType,ParentGroup',
      loadAttributes: 'True',
    }),
    rockGet(`/GroupMembers`, {
      $filter: `GroupId eq ${groupId}`,
      $expand: 'Person',
    }) as Promise<RockGroupMember[]>,
  ]);

  group.Members = members;
  if (group.ScheduleId) {
    group.Schedule = await rockGet(`/Schedules/${group.ScheduleId}`);
  }
  return group;
}
