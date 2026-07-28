'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGetAncestorLeadersByGroupId } from '@/server-actions/rockGetAncestorLeaders';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { ConnectRole } from '@/types/ConnectRole';
import { RockGuestlistItem } from '@/types/RockGuestlist';
import { RockGroupMember, RockGroupMemberStatus, RockGroupRoleId } from '@/types/RockGroupMember';
import { number, object } from 'zod';

const schema = object({
  groupId: number().int().positive(),
});

function getRoleFromGroupRoleId(roleId: number): ConnectRole | null {
  switch (roleId) {
    case RockGroupRoleId.ConnectGroupLeader:
      return ConnectRole.ConnectLeader;
    case RockGroupRoleId.ConnectGroupRegionalLeader:
      return ConnectRole.RegionalLeader;
    case RockGroupRoleId.ConnectGroupClusterHead:
      return ConnectRole.ClusterHead;
    default:
      return null;
  }
}

/**
 * Get guestlist for a connect group (no event context).
 * Returns all active group members as expected guests.
 * Replaces fluroGetGuestlistByConnectId.
 */
export async function rockGetGuestlistByConnectId(
  groupId: number
): Promise<RockGuestlistItem[]> {
  await assertAuthenticated();
  schema.parse({ groupId });

  const [members, ancestorLeaders] = await Promise.all([
    rockGet('/GroupMembers', {
      $filter: `GroupId eq ${groupId}`,
      $expand: 'Person,GroupRole',
      $top: 500,
    }) as Promise<RockGroupMember[]>,
    rockGetAncestorLeadersByGroupId([groupId]),
  ]);

  const guests = new Map<number, RockGuestlistItem>();

  for (const member of members) {
    if (member.GroupMemberStatus !== RockGroupMemberStatus.Active || !member.Person) continue;
    const role = getRoleFromGroupRoleId(member.GroupRoleId);
    guests.set(member.PersonId, {
      ...member.Person,
      attendance: { guestExpected: true },
      roles: role ? [role] : undefined,
      groupMemberId: member.Id,
      groupRoleName: member.GroupRole?.Name,
    });
  }

  for (const leader of ancestorLeaders) {
    if (!leader.Id) continue;
    const existing = guests.get(leader.Id);
    if (existing) {
      const roles = new Set([...(existing.roles || []), ...(leader.roles || [])]);
      existing.roles = Array.from(roles);
    } else {
      guests.set(leader.Id, leader);
    }
  }

  return Array.from(guests.values());
}
