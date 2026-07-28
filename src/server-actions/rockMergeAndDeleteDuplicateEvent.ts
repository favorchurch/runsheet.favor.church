'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { RockAttendance } from '@/types/RockAttendance';
import { revalidateTag } from 'next/cache';
import { number, object } from 'zod';

const schema = object({
  duplicateOccurrenceId: number().int().positive(),
  targetOccurrenceId: number().int().positive(),
});

/**
 * Result of a merge attempt. The action never throws for operational (Rock API)
 * failures — it returns a structured result so the client can show the real
 * reason instead of Next.js's opaque "An error occurred in the Server
 * Components render" digest (which is all a thrown Server Action error leaves
 * behind in production).
 */
export type MergeDuplicateResult = { ok: true; movedCount: number } | { ok: false; error: string };

/**
 * Resolve the connect group for an AttendanceOccurrence. The dashboards build
 * their event rows from /AttendanceOccurrences (see
 * rockGetMultipleConnectEventsDateFilter), so the ids passed here are
 * AttendanceOccurrence ids — resolve the group directly from that entity.
 */
async function getOccurrenceGroupId(occurrenceId: number): Promise<number | undefined> {
  try {
    const occurrence: { GroupId?: number } = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
      $select: 'GroupId',
    });
    return occurrence?.GroupId;
  } catch {
    return undefined;
  }
}

/**
 * Merge attendance from a duplicate AttendanceOccurrence into the target
 * (winner) occurrence, then delete the duplicate occurrence.
 *
 * NOTE: `duplicateOccurrenceId`/`targetOccurrenceId` are **AttendanceOccurrence**
 * ids (Attendances.OccurrenceId → AttendanceOccurrence.Id), not calendar-side
 * EventItemOccurrence ids. Everything here operates on the attendance model.
 * Replaces fluroMergeAndDeleteDuplicateEvent.
 */
export async function rockMergeAndDeleteDuplicateEvent(
  duplicateOccurrenceId: number,
  targetOccurrenceId: number
): Promise<MergeDuplicateResult> {
  await assertAuthenticated();
  schema.parse({ duplicateOccurrenceId, targetOccurrenceId });

  try {
    // Check access for both source and target occurrences' groups
    const [duplicateGroupId, targetGroupId] = await Promise.all([
      getOccurrenceGroupId(duplicateOccurrenceId),
      getOccurrenceGroupId(targetOccurrenceId),
    ]);

    if (duplicateGroupId) {
      await assertAccessibleGroupId(duplicateGroupId);
    }
    if (targetGroupId) {
      await assertAccessibleGroupId(targetGroupId);
    }

    // 1. Get attendance for both occurrences
    const [duplicateAttendances, targetAttendances]: [RockAttendance[], RockAttendance[]] = await Promise.all([
      rockGet('/Attendances', {
        $filter: `OccurrenceId eq ${duplicateOccurrenceId}`,
        $select: 'Id,PersonAliasId,DidAttend,StartDateTime',
      }),
      rockGet('/Attendances', {
        $filter: `OccurrenceId eq ${targetOccurrenceId}`,
        $select: 'Id,PersonAliasId',
      }),
    ]);

    // 2. Find PersonAliasIds to move
    const targetPersonIds = new Set(targetAttendances.map((a) => a.PersonAliasId));
    const toMove = duplicateAttendances.filter((a) => !targetPersonIds.has(a.PersonAliasId));

    console.log(`Merging ${toMove.length} attendance records from ${duplicateOccurrenceId} to ${targetOccurrenceId}`);

    // 3. Create attendance records on target
    await Promise.all(
      toMove.map((a) =>
        rockPost('/Attendances', {
          OccurrenceId: targetOccurrenceId,
          PersonAliasId: a.PersonAliasId,
          DidAttend: a.DidAttend ?? true,
          StartDateTime: a.StartDateTime,
          CheckInStatus: 2,
        })
      )
    );

    // 4. Delete duplicate attendance records (idempotent: already-gone rows 404)
    await Promise.all(duplicateAttendances.map((a) => rockDelete(`/Attendances/${a.Id}`, undefined, [404])));

    // 5. Delete the duplicate AttendanceOccurrence itself. A 404 here means the
    //    occurrence was already deleted (stale/cached list, concurrent merge, or
    //    double-submit) — that is exactly the outcome we want, so treat it as
    //    success rather than aborting the whole batch.
    await rockDelete(`/AttendanceOccurrences/${duplicateOccurrenceId}`, undefined, [404]);

    revalidateTag('rock:attendanceoccurrences');

    return { ok: true, movedCount: toMove.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    console.error(`Failed to merge occurrence ${duplicateOccurrenceId} into ${targetOccurrenceId}:`, error);
    return { ok: false, error };
  }
}
