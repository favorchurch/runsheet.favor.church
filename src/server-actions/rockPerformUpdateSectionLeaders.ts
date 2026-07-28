'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleSectionId } from '@/auth0-hooks/server/assertAccessibleSectionId';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { RockGroupMember, RockGroupMemberStatus, RockGroupRoleId } from '@/types/RockGroupMember';
import { revalidateTag } from 'next/cache';
import { array, number, object } from 'zod';

const schema = object({
  sectionId: number().int().positive(),
  personIds: array(number().int().positive()),
});

/**
 * Replace the leaders of a 'Cluster //' / 'Region //' section group.
 *
 * A section's cluster heads / regional leaders are simply its active members
 * (any role) — every connect group nested under the section inherits them via
 * rockGetScopedGroupHierarchy, so this single write cascades to the whole
 * hierarchy. Removal means deactivating the membership (there is no "member"
 * role to demote to, unlike connect groups).
 */
export async function rockPerformUpdateSectionLeaders(sectionId: number, personIds: number[]): Promise<void> {
  await assertAuthenticated();
  schema.parse({ sectionId, personIds });
  await assertAccessibleSectionId(sectionId);

  const section: RockGroup = await rockGet(`/Groups/${sectionId}`, {
    $select: 'Id,GroupTypeId',
  });
  if (section.GroupTypeId !== RockGroupType.ConnectGroupSection) {
    throw new Error(`Group ${sectionId} is not a connect group section`);
  }

  const allMembers: RockGroupMember[] = await rockGet('/GroupMembers', {
    $filter: `GroupId eq ${sectionId}`,
    $select: 'Id,PersonId,GroupRoleId,GroupMemberStatus',
  });
  const activeMembers = allMembers.filter((m) => m.GroupMemberStatus === RockGroupMemberStatus.Active);
  const desired = new Set(personIds);

  // Deactivate active members no longer in the leader list
  for (const member of activeMembers) {
    if (!desired.has(member.PersonId)) {
      await rockPatch(`/GroupMembers/${member.Id}`, {
        GroupMemberStatus: RockGroupMemberStatus.Inactive,
      });
    }
  }

  // Add (or reactivate) leaders who aren't active members yet
  const activePersonIds = new Set(activeMembers.map((m) => m.PersonId));
  const inactiveByPersonId = new Map(
    allMembers.filter((m) => m.GroupMemberStatus !== RockGroupMemberStatus.Active).map((m) => [m.PersonId, m])
  );
  for (const personId of desired) {
    if (activePersonIds.has(personId)) continue;
    const existing = inactiveByPersonId.get(personId);
    if (existing) {
      await rockPatch(`/GroupMembers/${existing.Id}`, {
        GroupMemberStatus: RockGroupMemberStatus.Active,
      });
    } else {
      await rockPost('/GroupMembers', {
        GroupId: sectionId,
        PersonId: personId,
        GroupRoleId: RockGroupRoleId.ConnectGroupSectionMember,
        GroupMemberStatus: RockGroupMemberStatus.Active,
        GroupTypeId: RockGroupType.ConnectGroupSection,
      });
    }
  }

  revalidateTag('rock:groupmembers');
  // rockGetSectionLeaders reads /Groups?$expand=Members (tagged 'rock:groups'),
  // so a membership change must invalidate that tag too or the reopened editor
  // shows stale leaders.
  revalidateTag('rock:groups');
}
