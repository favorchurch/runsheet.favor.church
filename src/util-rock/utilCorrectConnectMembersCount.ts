import { RockGuestlistItem } from '../types/RockGuestlist';
import { RockGroup } from '../types/RockGroup';
import { RockGroupMemberStatus } from '../types/RockGroupMember';

/**
 * Compute the correct member count for a connect group.
 * Replaces utilCorrectConnectMembersCount.
 *
 * Excludes regional leaders, cluster heads, and admins who are NOT also connect leaders.
 */
export function rockCorrectConnectMembersCount(
  group: RockGroup,
  _guestlist?: RockGuestlistItem[]
): number | undefined {
  if (!group.Members) return undefined;

  return group.Members.filter(
    (m) => m.GroupMemberStatus === RockGroupMemberStatus.Active
  ).length;
}
