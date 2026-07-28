'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import {
  rockUpsertGroupAttributeValue,
  rockResolveConnectCollectingMembersAttributeId,
} from '@/server-actions/internal/rockConnectGroupAttributes';
import { rockDeleteFutureAttendanceOccurrencesForConnect } from './rockDeleteFutureAttendanceOccurrencesForConnect';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { number, object, boolean, string } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  isCollecting: boolean(),
  fromIso: string().optional(),
});

/**
 * Set or clear the ConnectCollectingMembers flag for a connect group.
 *
 * When setting to true (actively collecting members):
 * - Sets the attribute to 'True'
 * - Deletes future AttendanceOccurrences that have no attendance
 *
 * When setting to false (group is running events):
 * - Sets the attribute to 'False'
 *
 * The flag stays independent from IsActive/IsArchived — the group's
 * active status is controlled separately via rockPerformUpdateConnectGroup.
 */
export async function rockSetConnectCollectingMembers(
  groupId: number,
  isCollecting: boolean,
  fromIso?: string
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ groupId, isCollecting, fromIso });
  await assertAccessibleGroupId(groupId);

  try {
    // Resolve the AttributeId for ConnectCollectingMembers on GroupType 25
    const attributeId = await rockResolveConnectCollectingMembersAttributeId();

    // Upsert the attribute value: 'True' or 'False'
    const rawValue = isCollecting ? 'True' : 'False';
    await rockUpsertGroupAttributeValue(groupId, attributeId, rawValue);

    // When setting to collecting, delete future occurrences
    if (isCollecting) {
      await rockDeleteFutureAttendanceOccurrencesForConnect(groupId, fromIso);
    }

    revalidateTag('rock:groups');
    revalidateTag('rock:attributevalues');
    await rockClearGroupHierarchyCache();
  } catch (err) {
    console.error('Error setting ConnectCollectingMembers flag:', err);
    throw err;
  }
}
