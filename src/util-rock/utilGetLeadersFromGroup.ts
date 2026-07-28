import { ConnectRole } from '../types/ConnectRole';
import { RockGroup } from '../types/RockGroup';
import { RockGroupMemberStatus } from '../types/RockGroupMember';
import { RockPerson } from '../types/RockPerson';
import { rockGetConnectRoleFromGroupRoleId } from './utilGetConnectRoleFromGroupRoleId';

/**
 * Extract leaders from a Rock group's Members array.
 *
 * Rock uses Members[] with integer GroupRoleId and IsLeader flag.
 */
export function rockGetLeadersFromGroup(
  group: RockGroup,
  role?: ConnectRole
): RockPerson[] {
  if (!group.Members) return [];

  return group.Members
    .filter((member) => {
      if (member.GroupMemberStatus !== RockGroupMemberStatus.Active) return false;
      const memberRole = rockGetConnectRoleFromGroupRoleId(member.GroupRoleId);
      if (!memberRole) return false; // not a leader role
      if (role && memberRole !== role) return false; // specific role requested
      return true;
    })
    .map((member) => member.Person)
    .filter(Boolean) as RockPerson[];
}

/**
 * Get connect leaders from a group.
 * Replaces fluroGetConnectLeaders.
 */
export const rockGetConnectLeaders = (group: RockGroup) =>
  rockGetLeadersFromGroup(group, ConnectRole.ConnectLeader);

/**
 * Get regional leaders from a group.
 * Replaces fluroGetRegionalLeaders.
 */
export const rockGetRegionalLeaders = (group: RockGroup) =>
  rockGetLeadersFromGroup(group, ConnectRole.RegionalLeader);

/**
 * Get cluster heads from a group.
 * Replaces fluroGetClusterHeads.
 */
export const rockGetClusterHeads = (group: RockGroup) =>
  rockGetLeadersFromGroup(group, ConnectRole.ClusterHead);
