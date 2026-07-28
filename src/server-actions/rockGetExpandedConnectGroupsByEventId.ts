'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { RockPerson } from '@/types/RockPerson';
import { number, object } from 'zod';

const schema = object({
  occurrenceId: number().int().positive(),
});

/**
 * Get expanded connect groups linked to an AttendanceOccurrence.
 * Replaces EventItemOccurrence-based logic.
 */
export async function rockGetExpandedConnectGroupsByEventId(
  occurrenceId: number
): Promise<RockGroup[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceId });

  // Get the occurrence to find the linked GroupId
  const occurrence = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
    $select: 'Id,GroupId',
  });

  if (!occurrence?.GroupId) return [];

  const groupIds = [occurrence.GroupId];
  
  const groups: RockGroup[] = await batchODataFilter<RockGroup>(groupIds, 'Id', (filter) =>
    rockGet('/Groups', {
      $filter: filter,
      $expand: 'Members,GroupType',
    })
  );

  const personIds = Array.from(
    new Set(
      groups
        .flatMap((g) => g.Members || [])
        .map((m) => m.PersonId)
        .filter((id): id is number => !!id)
    )
  );

  const people = personIds.length > 0
    ? await batchODataFilter<RockPerson>(personIds, 'Id', (filter) =>
        rockGet('/People', { $filter: filter })
      )
    : [];
  const personMap = new Map(people.map((p) => [p.Id, p]));

  for (const group of groups) {
    if (group.Members) {
      for (const member of group.Members) {
        if (member.PersonId) {
          member.Person = personMap.get(member.PersonId);
        }
      }
    }
  }

  return groups;
}
