'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockPatch, rockGet } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object } from 'zod';

const schema = object({
  registrationId: number().int().positive(),
});

/**
 * Update a registration's status by setting the IsTemporary flag.
 * Replaces fluroSetSignupStatus.
 *
 * Registrations use IsTemporary to indicate archived state (no dedicated archive attribute).
 * For archiving, we mark as temporary; for activating, we clear it.
 */
export async function rockSetSignupStatus(
  registrationId: number,
  status: 'active' | 'archived'
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ registrationId });

  // Resolve and enforce access to the registration's group (fail closed).
  const registration: { GroupId?: number } = await rockGet(`/Registrations/${registrationId}`, {
    $select: 'GroupId',
  });
  const groupId = registration?.GroupId;
  if (!groupId) throw new Error("FORBIDDEN: could not resolve the registration's connect group");
  await assertAccessibleGroupId(groupId);

  await rockPatch(`/Registrations/${registrationId}`, {
    IsTemporary: status === 'archived',
  });

  revalidateTag('rock:registrations');
  await rockClearGroupHierarchyCache();
}
