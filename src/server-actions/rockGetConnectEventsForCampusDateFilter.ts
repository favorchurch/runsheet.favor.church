'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { array, number, object, string } from 'zod';

const schema = object({
  campusIds: array(number().int().positive()).min(1),
  startDate: string().optional(),
  endDate: string().optional(),
});

/**
 * Get EventItemOccurrences for campus(es) within a date range.
 * Replaces fluroGetConnectEventsForRealmsDateFilter.
 *
 * Queries occurrences that are linked to connect groups (via EventItemOccurrenceGroupMaps)
 * within the specified campuses.
 */
export async function rockGetConnectEventsForCampusDateFilter(
  campusIds: number[],
  startDate?: string,
  endDate?: string
): Promise<RockEventItemOccurrence[]> {
  await assertAuthenticated();
  schema.parse({ campusIds, startDate, endDate });

  // Build filter
  const filters: string[] = [];
  const campusFilter = campusIds.length === 1
    ? `CampusId eq ${campusIds[0]}`
    : `(${campusIds.map((id) => `CampusId eq ${id}`).join(' or ')})`;
  filters.push(campusFilter);

  if (startDate) filters.push(`NextStartDateTime ge datetime'${startDate}'`);
  if (endDate) filters.push(`NextStartDateTime lt datetime'${endDate}'`);

  const occurrences: RockEventItemOccurrence[] = await rockGet('/EventItemOccurrences', {
    $filter: filters.join(' and '),
    $orderby: 'NextStartDateTime',
    $expand: 'Campus,Linkages',
    $top: 200,
  });

  return occurrences;
}
