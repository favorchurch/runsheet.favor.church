'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { array, number, object, string } from 'zod';

const schema = object({
  groupIds: array(number().int().positive()),
  startDate: string().optional(),
  endDate: string().optional(),
});

/**
 * Get AttendanceOccurrences for multiple connect groups within a date range.
 * Replaces fluroGetMultipleConnectEventsDateFilter.
 */
export async function rockGetMultipleConnectEventsDateFilter(
  groupIds: number[],
  startDate?: string,
  endDate?: string
): Promise<RockEventItemOccurrence[]> {
  await assertAuthenticated();
  schema.parse({ groupIds, startDate, endDate });
  if (!groupIds.length) return [];

  // Step 1: Query AttendanceOccurrences with date filter (batched)
  const occurrences = await batchODataFilter(
    groupIds,
    'GroupId',
    (groupFilter) => {
      const filters: string[] = [groupFilter];
      if (startDate) filters.push(`OccurrenceDate ge datetime'${startDate.split('T')[0]}T00:00:00'`);
      if (endDate) filters.push(`OccurrenceDate lt datetime'${endDate.split('T')[0]}T00:00:00'`);

      return rockGet('/AttendanceOccurrences', {
        $filter: filters.join(' and '),
        $orderby: 'OccurrenceDate',
        $select: 'Id,OccurrenceDate,ScheduleId,GroupId,Notes,DidNotOccur',
        $top: groupIds.length * 4,
      });
    },
    { batchSize: 14 }
  );

  if (!occurrences.length) return [];

  // Step 2: Get attendance counts (batched by OccurrenceId)
  const occurrenceIds = occurrences.map((occ: any) => occ.Id);
  const attendances: Array<{ Id: number; OccurrenceId: number }> = await batchODataFilter(
    occurrenceIds,
    'OccurrenceId',
    (occFilter) =>
      rockGet('/Attendances', {
        $filter: `(${occFilter}) and DidAttend eq true`,
        $select: 'Id,OccurrenceId',
        $top: occurrences.length * 500,
      }),
    { batchSize: 15 }
  );

  const attendanceCountByOccurrenceId = attendances.reduce<Record<number, number>>((acc, attendance) => {
    acc[attendance.OccurrenceId] = (acc[attendance.OccurrenceId] || 0) + 1;
    return acc;
  }, {});

  return occurrences.map((occurrence: any) => ({
    Id: occurrence.Id,
    EventItemId: 0,
    NextStartDateTime: occurrence.OccurrenceDate,
    ScheduleId: occurrence.ScheduleId,
    Schedule: occurrence.Schedule,
    Linkages: [{ GroupId: occurrence.GroupId }],
    Notes: occurrence.Notes,
    DidNotOccur: occurrence.DidNotOccur,
    stats: {
      checkin: attendanceCountByOccurrenceId[occurrence.Id] || 0,
    },
  } as RockEventItemOccurrence));
}
