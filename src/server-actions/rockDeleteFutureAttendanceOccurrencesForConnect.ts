'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { getConnectWeekRange } from '@/util-date/getConnectWeekRange';
import { number, object, string } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  fromDate: string().optional(),
});

/**
 * Delete future AttendanceOccurrences for a connect group that have no attendance.
 * Replaces rockDeleteFutureEventsForConnect.
 */
export async function rockDeleteFutureAttendanceOccurrencesForConnect(
  groupId: number,
  fromDate?: string
): Promise<{ deleted: number; message: string }> {
  await assertAuthenticated();
  schema.parse({ groupId, fromDate });
  await assertAccessibleGroupId(groupId);

  try {
    // 1. Get occurrences from the given date onwards (Connect week starts on Sunday)
    const [startOfCurrentWeek] = getConnectWeekRange(fromDate ? new Date(fromDate) : new Date());
    
    const occurrences = await rockGet('/AttendanceOccurrences', {
      $filter: `GroupId eq ${groupId} and OccurrenceDate ge datetime'${startOfCurrentWeek.toISOString()}'`,
      $select: 'Id,OccurrenceDate',
      $top: 200,
    }) as Array<{ Id: number; OccurrenceDate: string }>;

    if (!occurrences.length) {
      return { deleted: 0, message: 'No attendance occurrences found for group' };
    }

    // 2. For each occurrence, check if it has attendance before deleting
    let deletedCount = 0;
    for (const occ of occurrences) {
      const attendances = await rockGet('/Attendances', {
        $filter: `OccurrenceId eq ${occ.Id} and DidAttend eq true`,
        $top: 1,
        $select: 'Id',
      }) as Array<{ Id: number }>;

      if (attendances.length > 0) {
        // console.log(`Skipping deletion of occurrence ${occ.Id} — has attendance records`);
        continue;
      }

      // console.log(`Deleting occurrence ${occ.Id}`);
      await rockDelete(`/AttendanceOccurrences/${occ.Id}`);
      deletedCount++;
    }

    if (deletedCount > 0) {
      revalidateTag('rock:attendanceoccurrences');
      await rockClearGroupHierarchyCache();
    }

    return { deleted: deletedCount, message: `Deleted ${deletedCount} future attendance occurrences` };
  } catch (err) {
    console.error('Error deleting future attendance occurrences:', err);
    throw err;
  }
}
