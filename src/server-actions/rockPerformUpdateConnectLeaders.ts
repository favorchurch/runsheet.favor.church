'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { RockGroupMember, RockGroupRoleId, RockGroupMemberStatus } from '@/types/RockGroupMember';
import { revalidateTag } from 'next/cache';
import { array, number, object } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  leaders: array(
    object({
      personId: number().int().positive(),
      roleId: number().int().positive(),
    })
  ),
});

interface LeaderUpdate {
  personId: number;
  roleId: number; // RockGroupRoleId
}

/**
 * Update leader assignments for a connect group.
 * Replaces fluroPerformUpdateConnectLeaders.
 *
 * Sets the GroupRoleId on GroupMember records:
 * - Leaders get roleId from the update
 * - Non-leaders get ConnectGroupMember (23)
 */
export async function rockPerformUpdateConnectLeaders(
  groupId: number,
  leaders: LeaderUpdate[],
  cascadeToEvents?: boolean
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ groupId, leaders });
  await assertAccessibleGroupId(groupId);

  // Get current group members
  const allMembers: RockGroupMember[] = await rockGet('/GroupMembers', {
    $filter: `GroupId eq ${groupId}`,
    $select: 'Id,PersonId,GroupRoleId,GroupMemberStatus',
  });
  const members = allMembers.filter((m) => m.GroupMemberStatus === RockGroupMemberStatus.Active);

  const leaderMap = new Map(leaders.map((l) => [l.personId, l.roleId]));

  // Update each member's role
  for (const member of members) {
    const desiredRoleId = leaderMap.get(member.PersonId);

    if (desiredRoleId && member.GroupRoleId !== desiredRoleId) {
      // Set as leader with specified role
      await rockPatch(`/GroupMembers/${member.Id}`, {
        GroupRoleId: desiredRoleId,
      });
    } else if (!desiredRoleId && member.GroupRoleId !== RockGroupRoleId.ConnectGroupMember) {
      // Not in leaders list but has a leader role — demote to member
      await rockPatch(`/GroupMembers/${member.Id}`, {
        GroupRoleId: RockGroupRoleId.ConnectGroupMember,
      });
    }
  }

  // Add leaders who aren't members yet
  const memberPersonIds = new Set(members.map((m) => m.PersonId));
  for (const leader of leaders) {
    if (!memberPersonIds.has(leader.personId)) {
      await rockPost('/GroupMembers', {
        GroupId: groupId,
        PersonId: leader.personId,
        GroupRoleId: leader.roleId,
        GroupMemberStatus: RockGroupMemberStatus.Active,
        GroupTypeId: RockGroupType.ConnectGroup,
      });
    }
  }

  // If cascading, update EventItem name to match group name
  if (cascadeToEvents) {
    const group: RockGroup = await rockGet(`/Groups/${groupId}`, { $select: 'Name' });
    const groupMaps: any[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `GroupId eq ${groupId}`,
      $select: 'EventItemOccurrenceId',
      $top: 1,
    });
    if (groupMaps.length && group.Name) {
      const occ: any = await rockGet(`/EventItemOccurrences/${groupMaps[0].EventItemOccurrenceId}`, {
        $select: 'EventItemId',
      });
      if (occ?.EventItemId) {
        await rockPatch(`/EventItems/${occ.EventItemId}`, { Name: group.Name });
      }
    }
  }

  revalidateTag('rock:groupmembers');
}
