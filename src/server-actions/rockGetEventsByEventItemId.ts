'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { number, object } from 'zod';

const schema = object({
  eventItemId: number().int().positive(),
});

/**
 * Get AttendanceOccurrences for a group within a date range.
 * Replaces EventItemOccurrence-based logic.
 */
export async function rockGetEventsByEventItemId(
  groupId: number,
  afterDate?: string
): Promise<RockEventItemOccurrence[]> {
  await assertAuthenticated();
  schema.parse({ eventItemId: groupId }); // eventItemId parameter is reused as groupId for compatibility

  const filter = `GroupId eq ${groupId}`;
  const fullFilter = afterDate
    ? `${filter} and OccurrenceDate ge datetime'${afterDate.split('T')[0]}T00:00:00'`
    : filter;

  const occurrences = (await rockGet('/AttendanceOccurrences', {
    $filter: fullFilter,
    $orderby: 'OccurrenceDate',
    $top: 100,
  })) as any[];

  return occurrences.map(
    (occurrence) =>
      ({
        Id: occurrence.Id,
        EventItemId: 0,
        NextStartDateTime: occurrence.OccurrenceDate,
        ScheduleId: occurrence.ScheduleId,
        Schedule: occurrence.Schedule,
        Linkages: [{ GroupId: groupId }],
      }) as RockEventItemOccurrence
  );
}
