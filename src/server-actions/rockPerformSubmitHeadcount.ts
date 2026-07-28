'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { number, object } from 'zod';

const schema = object({
  occurrenceId: number().int().positive(),
});

/**
 * Get headcount for an occurrence (count of attendance records).
 * Replaces fluroPerformSubmitHeadcount.
 *
 * Rock doesn't have a separate headcount field — it's derived from
 * the count of Attendance records where DidAttend is true.
 */
export async function rockGetHeadcount(
  occurrenceId: number
): Promise<number> {
  await assertAuthenticated();
  schema.parse({ occurrenceId });

  const attendances: any[] = await rockGet('/Attendances', {
    $filter: `OccurrenceId eq ${occurrenceId} and DidAttend eq true`,
    $select: 'Id',
    $top: 1000,
  });

  return attendances.length;
}
