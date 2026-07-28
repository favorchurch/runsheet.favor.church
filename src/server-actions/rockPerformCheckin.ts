'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { CHECKIN_NOTES } from '@/constants.server';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { RockAttendance } from '@/types/RockAttendance';
import { number, object, string } from 'zod';

export interface RockCheckinPayload {
  occurrenceId: number;
  personAliasId: number;
  startDateTime?: string;
  campusId?: number;
}

const schema = object({
  occurrenceId: number().int().positive(),
  personAliasId: number().int().positive(),
  startDateTime: string().optional(),
  campusId: number().int().positive().optional(),
});

async function getOccurrenceGroupId(occurrenceId: number): Promise<number | undefined> {
  try {
    const maps: any[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `EventItemOccurrenceId eq ${occurrenceId}`,
      $select: 'GroupId',
      $top: 1,
    });
    return maps?.[0]?.GroupId;
  } catch {
    return undefined;
  }
}

export async function rockPerformCheckin({
  occurrenceId,
  personAliasId,
  startDateTime,
  campusId,
}: RockCheckinPayload): Promise<RockAttendance> {
  await assertAuthenticated();
  schema.parse({ occurrenceId, personAliasId, startDateTime, campusId });

  // Resolve and check access to the occurrence's group
  const groupId = await getOccurrenceGroupId(occurrenceId);
  if (groupId) {
    await assertAccessibleGroupId(groupId);
  }

  // Fetch occurrence to get date if not provided
  let effectiveStartDateTime = startDateTime;
  if (!effectiveStartDateTime) {
    try {
      const occurrence = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
        $select: 'OccurrenceDate',
      });
      effectiveStartDateTime = occurrence?.OccurrenceDate;
    } catch (e) {
      console.error('Failed to fetch occurrence date for checkin', e);
    }
  }

  // Upsert: if an attendance record already exists for this person+occurrence,
  // update it instead of creating a duplicate.
  const existing: RockAttendance[] = await rockGet('/Attendances', {
    $filter: `PersonAliasId eq ${personAliasId} and OccurrenceId eq ${occurrenceId}`,
    $select: 'Id',
    $top: 1,
  });

  if (existing?.length) {
    const result = await rockPatch(`/Attendances/${existing[0].Id}`, {
      DidAttend: true,
      CheckInStatus: 2, // Present
    });
    revalidateTag('rock:attendances');
    await rockClearGroupHierarchyCache();
    return result;
  }

  const body: Record<string, any> = {
    OccurrenceId: occurrenceId,
    PersonAliasId: personAliasId,
    DidAttend: true,
    CheckInStatus: 2, // Present
    Note: CHECKIN_NOTES,
    StartDateTime: effectiveStartDateTime || new Date().toISOString(),
  };

  if (campusId) body.CampusId = campusId;

  const result = await rockPost('/Attendances', body);
  revalidateTag('rock:attendances');
  await rockClearGroupHierarchyCache();
  return result;
}
