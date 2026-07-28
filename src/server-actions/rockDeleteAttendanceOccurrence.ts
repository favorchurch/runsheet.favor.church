'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { RockAttendance } from '@/types/RockAttendance';
import { revalidateTag } from 'next/cache';
import { number } from 'zod';

const schema = number().int().positive();

export type DeleteOccurrenceResult = { ok: true } | { ok: false; error: string };

/**
 * Delete an AttendanceOccurrence (and its attendance rows) by id. Used by the
 * MERGE DUPLICATES flow for the edge case of a duplicate occurrence that has no
 * surviving "keep" winner to merge into.
 *
 * The id is an **AttendanceOccurrence** id — the same id `rockMergeAndDelete-
 * DuplicateEvent` operates on. The previous fallback routed these ids through
 * `rockDeleteContent(id, 'connectGroupMeeting')`, which treats the id as an
 * EventItemOccurrence id and deletes the wrong (calendar-side) entity. Deleting
 * is idempotent: a 404 means the occurrence is already gone, which is the goal.
 */
export async function rockDeleteAttendanceOccurrence(occurrenceId: number): Promise<DeleteOccurrenceResult> {
  await assertAuthenticated();
  schema.parse(occurrenceId);

  try {
    // Resolve and enforce access to the occurrence's group. If the occurrence
    // no longer exists the GET 404s → nothing to authorize and nothing to leak,
    // so fall through to the (idempotent) deletes below.
    const occurrence: { GroupId?: number } | null = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
      $select: 'GroupId',
    }).catch(() => null);
    if (occurrence?.GroupId) {
      await assertAccessibleGroupId(occurrence.GroupId);
    }

    // Delete attendance rows first (FK), then the occurrence. Both idempotent.
    const attendances: RockAttendance[] = await rockGet('/Attendances', {
      $filter: `OccurrenceId eq ${occurrenceId}`,
      $select: 'Id',
    });
    await Promise.all(attendances.map((a) => rockDelete(`/Attendances/${a.Id}`, undefined, [404])));
    await rockDelete(`/AttendanceOccurrences/${occurrenceId}`, undefined, [404]);

    revalidateTag('rock:attendanceoccurrences');

    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    console.error(`Failed to delete occurrence ${occurrenceId}:`, error);
    return { ok: false, error };
  }
}
