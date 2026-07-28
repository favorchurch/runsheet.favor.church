import { ConnectRole } from '../types/ConnectRole';
import { RockGroupRoleId } from '../types/RockGroupMember';

/**
 * Maps a Rock GroupRoleId to a ConnectRole enum.
 *
 * Rock uses integer role IDs, so leader handling should not rely on legacy
 * string matching against assignment titles except at the UI normalization
 * boundary.
 */
export function rockGetConnectRoleFromGroupRoleId(groupRoleId: number): ConnectRole | null {
  switch (groupRoleId) {
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
 * Maps a ConnectRole to the Rock GroupRoleId used when persisting membership.
 */
export function rockGetGroupRoleIdFromConnectRole(role: ConnectRole): number {
  switch (role) {
    case ConnectRole.ConnectLeader:
    case ConnectRole.AssistantLeader:
      return RockGroupRoleId.ConnectGroupLeader;
    case ConnectRole.RegionalLeader:
      return RockGroupRoleId.ConnectGroupRegionalLeader;
    case ConnectRole.ClusterHead:
      return RockGroupRoleId.ConnectGroupClusterHead;
    case ConnectRole.DepartmentHead:
      return RockGroupRoleId.ConnectGroupSectionMember; // Section leaders
    case ConnectRole.ConnectMember:
    default:
      return RockGroupRoleId.ConnectGroupMember;
  }
}
