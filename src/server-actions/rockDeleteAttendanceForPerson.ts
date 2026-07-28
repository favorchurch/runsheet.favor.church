'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object } from 'zod';

const schema = object({
  personAliasId: number().int().positive(),
  occurrenceId: number().int().positive(),
});

/**
 * Deletes ALL attendance records for a given person alias in a given occurrence.
 * Used to clean up duplicate or stale records when removing a member from a group.
 */
export async function rockDeleteAttendanceForPerson(personAliasId: number, occurrenceId: number): Promise<void> {
  await assertAuthenticated();
  schema.parse({ personAliasId, occurrenceId });

  // Resolve and enforce access to the occurrence's group (fail closed).
  const maps: { GroupId?: number }[] = await rockGet('/EventItemOccurrenceGroupMaps', {
    $filter: `EventItemOccurrenceId eq ${occurrenceId}`,
    $select: 'GroupId',
    $top: 1,
  });
  const groupId = maps?.[0]?.GroupId;
  if (!groupId) throw new Error("FORBIDDEN: could not resolve the occurrence's connect group");
  await assertAccessibleGroupId(groupId);

  const records: { Id: number }[] = await rockGet('/Attendances', {
    $filter: `PersonAliasId eq ${personAliasId} and OccurrenceId eq ${occurrenceId}`,
    $select: 'Id',
    $top: 500,
  });

  if (!records?.length) return;

  await Promise.all(records.map((r) => rockDelete(`/Attendances/${r.Id}`)));
  revalidateTag('rock:attendances');
  await rockClearGroupHierarchyCache();
}
