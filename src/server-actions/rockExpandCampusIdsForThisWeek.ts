'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { getConnectWeekRangeParams } from '@/util-date/getConnectWeekRange';
import { array, number, object, string } from 'zod';
import { rockGetMultipleConnectEventsDateFilter } from './rockGetMultipleConnectEventsDateFilter';

const schema = object({
  campusIds: array(number().int().positive()).min(1),
  beforeDate: string().optional(),
  afterDate: string().optional(),
});

export async function rockExpandCampusIdsForThisWeek(
  campusIds: number[],
  beforeDate?: string,
  afterDate?: string,
  weeks: 1 | 2 = 2
): Promise<{ events: RockEventItemOccurrence[]; groups: RockGroup[]; weeks: 1 | 2 }> {
  await assertAuthenticated();
  schema.parse({ campusIds, beforeDate, afterDate });

  const campusFilter =
    campusIds.length === 1
      ? `CampusId eq ${campusIds[0]}`
      : `(${campusIds.map((id) => `CampusId eq ${id}`).join(' or ')})`;
  const groups: RockGroup[] = await rockGet('/Groups', {
    $filter: `GroupTypeId eq ${RockGroupType.ConnectGroup} and ${campusFilter}`,
    $expand: 'Members,Members/Person',
    $orderby: 'Name',
    $top: 5000,
  });

  const [startDate, endDate] = getConnectWeekRangeParams({ beforeDate, afterDate, weeks });
  const events =
    groups.length > 0
      ? await rockGetMultipleConnectEventsDateFilter(
          groups.map((group) => group.Id),
          startDate.toISOString(),
          endDate.toISOString()
        )
      : [];

  return { events, groups, weeks };
}
