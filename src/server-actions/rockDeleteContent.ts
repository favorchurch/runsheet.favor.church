'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { number, object, string } from 'zod';

const schema = object({
  entityId: number().int().positive(),
  entityType: string().min(1),
});

/**
 * Delete a Rock entity by type and ID.
 */
export async function rockDeleteContent(
  entityId: number,
  entityType: string
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ entityId, entityType });

  // Map portal entity types to Rock entity endpoints
  const endpointMap: Record<string, string> = {
    group: 'Groups',
    connectGroupMeeting: 'EventItemOccurrences',
    event: 'EventItemOccurrences',
    eventtrack: 'EventItems',
    contact: 'People',
    checkin: 'Attendances',
  };

  // For group deletions, check access; for occurrence/event, resolve group from occurrence
  if (entityType === 'group') {
    await assertAccessibleGroupId(entityId);
  } else if (entityType === 'connectGroupMeeting' || entityType === 'event') {
    // Resolve and enforce access to the occurrence's group (fail closed).
    const maps: { GroupId?: number }[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `EventItemOccurrenceId eq ${entityId}`,
      $select: 'GroupId',
      $top: 1,
    });
    const groupId = maps?.[0]?.GroupId;
    if (!groupId) throw new Error("FORBIDDEN: could not resolve the occurrence's connect group");
    await assertAccessibleGroupId(groupId);
  } else {
    // Non-group-scoped entity types (contact, checkin, eventtrack) are high-impact
    // deletes with no group to scope against. Deny via the portal — these must be
    // performed through Rock directly by an admin.
    throw new Error(`FORBIDDEN: deleting entity type '${entityType}' is not permitted via the portal`);
  }

  const endpoint = endpointMap[entityType] || entityType;
  await rockDelete(`/${endpoint}/${entityId}`);
  revalidateTag('rock:groups');
}
