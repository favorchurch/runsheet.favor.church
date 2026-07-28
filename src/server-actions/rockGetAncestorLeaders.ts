'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { ConnectRole } from '@/types/ConnectRole';
import { RockGuestlistItem } from '@/types/RockGuestlist';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { RockGroupMember, RockGroupMemberStatus } from '@/types/RockGroupMember';
import { array, number, object } from 'zod';

const schema = object({
  groupIds: array(number().int().positive()),
});

function inferAncestorLeaderRole(group?: Pick<RockGroup, 'Name' | 'GroupTypeId'> | null): ConnectRole | null {
  if (!group || group.GroupTypeId !== RockGroupType.ConnectGroupSection) return null;
  if (group.Name?.startsWith('Region //')) return ConnectRole.RegionalLeader;
  if (group.Name?.startsWith('Cluster //')) return ConnectRole.ClusterHead;
  return null;
}

export async function rockGetAncestorLeadersByGroupId(groupIds: number[]): Promise<RockGuestlistItem[]> {
  await assertAuthenticated();
  schema.parse({ groupIds });
  if (!groupIds.length) return [];

  const groupCache = new Map<number, RockGroup | null>();
  const leaderGroups = new Map<number, ConnectRole>();

  async function loadGroup(groupId: number): Promise<RockGroup | null> {
    if (groupCache.has(groupId)) {
      return groupCache.get(groupId) || null;
    }

    try {
      const group = await rockGet(`/Groups/${groupId}`, {
        $select: 'Id,Name,ParentGroupId,GroupTypeId',
      });
      groupCache.set(groupId, group);
      return group;
    } catch {
      groupCache.set(groupId, null);
      return null;
    }
  }

  for (const groupId of [...new Set(groupIds)]) {
    let currentGroupId: number | null = groupId;
    for (let depth = 0; depth < 5 && currentGroupId; depth++) {
      const currentGroup = await loadGroup(currentGroupId);
      const parentGroupId = currentGroup?.ParentGroupId || null;
      if (!parentGroupId) break;

      const parentGroup = await loadGroup(parentGroupId);
      const role = inferAncestorLeaderRole(parentGroup);
      if (parentGroup?.Id && role) {
        leaderGroups.set(parentGroup.Id, role);
      }

      currentGroupId = parentGroupId;
    }
  }

  const leaderGroupIds = Array.from(leaderGroups.keys());
  if (!leaderGroupIds.length) return [];

  const members = await batchODataFilter<RockGroupMember>(
    leaderGroupIds,
    'GroupId',
    (groupFilter: string) =>
      rockGet('/GroupMembers', {
        $filter: groupFilter,
        $expand: 'Person',
        $top: leaderGroupIds.length * 100,
      })
  );

  const guests = new Map<number, RockGuestlistItem>();
  for (const member of members) {
    if (member.GroupMemberStatus !== RockGroupMemberStatus.Active || !member.Person) continue;
    const role = leaderGroups.get(member.GroupId);
    if (!role) continue;

    const personId = member.PersonId;
    const existing = guests.get(personId);
    if (existing) {
      if (!existing.roles?.includes(role)) {
        existing.roles = [...(existing.roles || []), role];
      }
      continue;
    }

    guests.set(personId, {
      ...member.Person,
      attendance: {
        guestExpected: false,
      },
      roles: [role],
      groupMemberId: member.Id,
    });
  }

  return Array.from(guests.values());
}
