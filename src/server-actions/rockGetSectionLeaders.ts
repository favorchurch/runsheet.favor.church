'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { RockGroupMemberStatus } from '@/types/RockGroupMember';
import { RockPerson } from '@/types/RockPerson';

/**
 * Fetch the leaders of a section group (Region or Cluster).
 *
 * Section groups are Rock groups of type ConnectGroupSection. Their active
 * members are the regional leaders or cluster heads for that section.
 * Returns RockPerson[] with the fields needed for avatar + tooltip display.
 */
export async function rockGetSectionLeaders(sectionId: number): Promise<RockPerson[]> {
  await assertAuthenticated();

  const groups: RockGroup[] = await rockGet('/Groups', {
    $filter: `Id eq ${sectionId}`,
    $expand: 'Members,Members/Person',
  });

  const group = groups?.[0];
  if (!group?.Members) return [];

  return group.Members
    .filter((m) => m.GroupMemberStatus === RockGroupMemberStatus.Active && m.Person)
    .map((m) => m.Person!)
    .filter(Boolean);
}
