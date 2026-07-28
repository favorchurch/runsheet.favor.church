'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockPatch, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { boolean, number, object } from 'zod';

const schema = object({
  occurrenceId: number().int().positive(),
  didNotOccur: boolean(),
});

/**
 * Update the DidNotOccur status for an attendance occurrence.
 */
export async function rockSaveAttendanceOccurrenceDidNotOccur(occurrenceId: number, didNotOccur: boolean) {
  await assertAuthenticated();
  schema.parse({ occurrenceId, didNotOccur });

  // Resolve and enforce access to the occurrence's group (fail closed).
  // The AttendanceOccurrence carries GroupId directly and is the source of
  // truth; fall back to the event map for event-backed occurrences that don't.
  let groupId: number | undefined;
  const occurrence: { GroupId?: number } = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
    $select: 'GroupId',
  });
  groupId = occurrence?.GroupId ?? undefined;
  if (!groupId) {
    const maps: { GroupId?: number }[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `EventItemOccurrenceId eq ${occurrenceId}`,
      $select: 'GroupId',
      $top: 1,
    });
    groupId = maps?.[0]?.GroupId;
  }
  if (!groupId) throw new Error("FORBIDDEN: could not resolve the occurrence's connect group");
  await assertAccessibleGroupId(groupId);

  try {
    const updatedOccurrence = await rockPatch(`/AttendanceOccurrences/${occurrenceId}`, {
      DidNotOccur: didNotOccur,
    });
    revalidateTag('rock:attendanceoccurrences');
    await rockClearGroupHierarchyCache();

    return updatedOccurrence;
  } catch (error) {
    console.error('Error saving DidNotOccur to Rock:', error);
    throw error;
  }
}
