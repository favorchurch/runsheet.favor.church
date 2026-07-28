'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockAttendance } from '@/types/RockAttendance';
import { array, number, object } from 'zod';

const schema = object({
  occurrenceIds: array(number().int().positive()).min(1),
});

/**
 * Get all attendance records for one or more occurrences.
 * Replaces fluroGetAllEventCheckins.
 */
export async function rockGetAllEventCheckins(
  occurrenceIds: number[]
): Promise<RockAttendance[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceIds });

  return batchODataFilter(
    occurrenceIds,
    'OccurrenceId',
    (idFilter) =>
      rockGet('/Attendances', {
        $filter: idFilter,
        $select: 'Id,OccurrenceId,PersonAliasId,DidAttend,StartDateTime,CheckInStatus',
        $orderby: 'StartDateTime',
        $top: 1000,
      }),
    { batchSize: 15 }
  );
}
