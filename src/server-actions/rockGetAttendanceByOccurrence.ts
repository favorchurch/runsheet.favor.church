'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockAttendance } from '@/types/RockAttendance';
import { number, object } from 'zod';

const schema = object({
  occurrenceId: number().int().positive(),
});

export async function rockGetAttendanceByOccurrence(
  occurrenceId: number
): Promise<RockAttendance[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceId });

  return await rockGet('/Attendances', {
    $filter: `OccurrenceId eq ${occurrenceId}`,
    $orderby: 'StartDateTime',
    $top: 500,
  });
}
