'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockPatch, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object, string } from 'zod';

const schema = object({
  eventId: number().int().positive(),
  notes: string(),
});

/**
 * Save care notes to a Rock attendance occurrence.
 * This overwrites existing notes.
 * @param eventId The Rock AttendanceOccurrence ID
 * @param notes The care notes content
 * @returns Promise resolving to the updated occurrence
 */
export async function rockSaveAttendanceCareNotes(eventId: number, notes: string) {
  await assertAuthenticated();
  schema.parse({ eventId, notes });

  // Resolve and enforce access to the occurrence's group (fail closed).
  // The AttendanceOccurrence carries GroupId directly and is the source of
  // truth; fall back to the event map for event-backed occurrences that don't.
  let groupId: number | undefined;
  const occurrence: { GroupId?: number } = await rockGet(`/AttendanceOccurrences/${eventId}`, {
    $select: 'GroupId',
  });
  groupId = occurrence?.GroupId ?? undefined;
  if (!groupId) {
    const maps: { GroupId?: number }[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `EventItemOccurrenceId eq ${eventId}`,
      $select: 'GroupId',
      $top: 1,
    });
    groupId = maps?.[0]?.GroupId;
  }
  if (!groupId) throw new Error("FORBIDDEN: could not resolve the occurrence's connect group");
  await assertAccessibleGroupId(groupId);

  try {
    // Update the attendance occurrence directly using PATCH
    const updatedOccurrence = await rockPatch(`/AttendanceOccurrences/${eventId}`, {
      Notes: notes,
    });
    revalidateTag('rock:attendanceoccurrences');
    await rockClearGroupHierarchyCache();

    return updatedOccurrence;
  } catch (error) {
    console.error('Error saving care notes to Rock:', error);
    throw error;
  }
}
