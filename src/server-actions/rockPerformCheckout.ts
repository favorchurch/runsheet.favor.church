'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockPatch, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object } from 'zod';

const schema = object({
  attendanceId: number().int().positive(),
});

async function getAttendanceGroupId(attendanceId: number): Promise<number | undefined> {
  try {
    const attendance: any = await rockGet(`/Attendances/${attendanceId}`, {
      $select: 'OccurrenceId',
    });
    if (!attendance?.OccurrenceId) return undefined;

    const maps: any[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `EventItemOccurrenceId eq ${attendance.OccurrenceId}`,
      $select: 'GroupId',
      $top: 1,
    });
    return maps?.[0]?.GroupId;
  } catch {
    return undefined;
  }
}

export async function rockPerformCheckout(attendanceId: number): Promise<any> {
  await assertAuthenticated();
  schema.parse({ attendanceId });

  // Resolve and check access to the attendance's group
  const groupId = await getAttendanceGroupId(attendanceId);
  if (groupId) {
    await assertAccessibleGroupId(groupId);
  }

  const result = await rockPatch(`/Attendances/${attendanceId}`, {
    DidAttend: false,
    CheckInStatus: 3, // Checked out
  });
  revalidateTag('rock:attendances');
  await rockClearGroupHierarchyCache();
  return result;
}
