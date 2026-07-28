'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockGet, rockPatch } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { RockGroup } from '@/types/RockGroup';
import { number, object } from 'zod';

const schema = object({
  groupId: number().int().positive(),
});

export async function rockPerformUpdateConnectGroup(
  groupId: number,
  updates: {
    name?: string;
    description?: string;
    isActive?: boolean;
    capacity?: number;
    isArchived?: boolean;
  }
): Promise<RockGroup> {
  await assertAuthenticated();
  schema.parse({ groupId });
  await assertAccessibleGroupId(groupId);

  const body: Record<string, any> = {};
  if (updates.name !== undefined) body.Name = updates.name;
  if (updates.description !== undefined) body.Description = updates.description;
  if (updates.isActive !== undefined) body.IsActive = updates.isActive;
  if (updates.capacity !== undefined) body.GroupCapacity = updates.capacity;
  if (updates.isArchived !== undefined) body.IsArchived = updates.isArchived;

  if (Object.keys(body).length === 0) {
    return (await rockGet(`/Groups/${groupId}`)) as RockGroup;
  }

  const result = await rockPatch(`/Groups/${groupId}`, body);
  revalidateTag('rock:groups');
  await rockClearGroupHierarchyCache();
  return result;
}
