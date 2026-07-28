'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { number, object, string } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  occurrenceDate: string(), // ISO date
  scheduleId: number().int().optional(),
});

export interface RockAttendanceOccurrence {
  Id: number;
  GroupId?: number | null;
  ScheduleId?: number | null;
  OccurrenceDate?: string | null;
  SundayDate?: string | null;
  Notes?: string | null;
}

/**
 * Get or create an AttendanceOccurrence for a group on a specific date.
 */
export async function rockGetAttendanceOccurrence(
  groupId: number,
  occurrenceDate: string,
  scheduleId?: number
): Promise<RockAttendanceOccurrence> {
  await assertAuthenticated();
  schema.parse({ groupId, occurrenceDate, scheduleId });
  await assertAccessibleGroupId(groupId);

  // Use only the date part for filtering
  const dateOnly = occurrenceDate.split('T')[0];

  const existing = await rockGet(
    '/AttendanceOccurrences',
    {
      $filter: `GroupId eq ${groupId} and OccurrenceDate eq datetime'${dateOnly}T00:00:00'`,
      $top: 1,
    },
    true
  ) as RockAttendanceOccurrence[];

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new occurrence
  let activeScheduleId = scheduleId;
  try {
    let id;
    try {
      id = await rockPost('/AttendanceOccurrences', {
        GroupId: groupId,
        OccurrenceDate: `${dateOnly}T00:00:00`,
        ScheduleId: activeScheduleId,
      });
    } catch (postError) {
      if (activeScheduleId !== undefined) {
        console.warn(
          `[rockGetAttendanceOccurrence] POST failed with ScheduleId ${activeScheduleId}. Retrying without ScheduleId...`,
          postError
        );
        id = await rockPost('/AttendanceOccurrences', {
          GroupId: groupId,
          OccurrenceDate: `${dateOnly}T00:00:00`,
        });
        activeScheduleId = undefined;
      } else {
        throw postError;
      }
    }

    return {
      Id: id,
      GroupId: groupId,
      OccurrenceDate: occurrenceDate,
      ScheduleId: activeScheduleId,
    };
  } catch (error) {
    console.warn(
      `[rockGetAttendanceOccurrence] POST failed for group ${groupId} on ${dateOnly}. Checking if it exists now...`,
      error
    );

    // Double-check without cache
    const existingAgain = await rockGet(
      '/AttendanceOccurrences',
      {
        $filter: `GroupId eq ${groupId} and OccurrenceDate eq datetime'${dateOnly}T00:00:00'`,
        $top: 1,
      },
      true
    ) as RockAttendanceOccurrence[];

    if (existingAgain.length > 0) {
      console.log(
        `[rockGetAttendanceOccurrence] Confirmed occurrence exists after concurrent POST failure.`
      );
      return existingAgain[0];
    }

    // Otherwise, rethrow the original error
    throw error;
  }

}
