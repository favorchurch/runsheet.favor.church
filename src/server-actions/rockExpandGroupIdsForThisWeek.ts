'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { RockGroup } from '@/types/RockGroup';
import { getConnectWeekRangeParams } from '@/util-date/getConnectWeekRange';
import { array, number, object, string } from 'zod';
import { rockExpandGroupIds } from './rockExpandGroupIds';
import { rockGetMultipleConnectEventsDateFilter } from './rockGetMultipleConnectEventsDateFilter';

const schema = object({
  groupIds: array(number().int().positive()),
  beforeDate: string().optional(),
  afterDate: string().optional(),
});

/**
 * Expand Rock Connect Group IDs into groups and AttendanceOccurrences for a
 * Connect week window.
 *
 * This is the Rock replacement for the old realm-expansion flow. Active
 * attendance dashboards use AttendanceOccurrences linked by `GroupId`; the
 * returned events are compatibility-shaped for the portal UI.
 */
export async function rockExpandGroupIdsForThisWeek(
  groupIds: number[],
  beforeDate?: string,
  afterDate?: string,
  weeks: 1 | 2 = 2
): Promise<{ events: RockEventItemOccurrence[]; groups: RockGroup[]; weeks: 1 | 2 }> {
  await assertAuthenticated();
  schema.parse({ groupIds, beforeDate, afterDate });
  if (!groupIds.length) return { events: [], groups: [], weeks };

  const groups = await rockExpandGroupIds(groupIds);
  const [startDate, endDate] = getConnectWeekRangeParams({ beforeDate, afterDate, weeks });

  const events = await rockGetMultipleConnectEventsDateFilter(
    groupIds,
    startDate.toISOString(),
    endDate.toISOString()
  );

  return { events, groups, weeks };
}
