'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { array, number, object } from 'zod';

const schema = object({
  eventIds: array(number().int().positive()),
});

interface OccurrenceRow {
  Id: number;
  Notes: string | null;
}

/**
 * Get care notes for many attendance occurrences in a single batched call.
 *
 * Uses the shared OData batching utility so the request stays under Rock's
 * MaxNodeCount limit. Returns a map keyed by AttendanceOccurrence Id so cells
 * can resolve their notes synchronously.
 */
export async function rockGetAttendanceCareNotesMultiple(
  eventIds: number[]
): Promise<Record<number, string | null>> {
  await assertAuthenticated();

  const uniqueIds = Array.from(new Set(eventIds.filter((id): id is number => typeof id === 'number' && id > 0)));
  if (!uniqueIds.length) return {};

  schema.parse({ eventIds: uniqueIds });

  const rows = await batchODataFilter<OccurrenceRow>(
    uniqueIds,
    'Id',
    (filter) =>
      rockGet('/AttendanceOccurrences', {
        $filter: filter,
        $select: 'Id,Notes',
      }),
    { batchSize: 12 }
  );

  return Object.fromEntries(rows.map((r) => [r.Id, r.Notes ?? null]));
}
