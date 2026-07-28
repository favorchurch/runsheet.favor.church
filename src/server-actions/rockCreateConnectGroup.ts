'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertHasRole } from '@/auth0-hooks/server/assertHasRole';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { ConnectRole } from '@/types/ConnectRole';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { RockGroup } from '@/types/RockGroup';
import { RockGroupType } from '@/types/RockGroup';
import { boolean, number, object, string } from 'zod';

export interface RockCreateGroupPayload {
  name: string;
  groupTypeId: number;
  campusId?: number;
  description?: string;
  isActive?: boolean;
  parentGroupId?: number;
  capacity?: number;
}

const schema = object({
  name: string(),
  groupTypeId: number().int().positive(),
  campusId: number().int().positive().optional(),
  description: string().optional(),
  isActive: boolean().optional(),
  parentGroupId: number().int().positive().optional(),
  capacity: number().int().positive().optional(),
});

export async function rockCreateConnectGroup(
  data: RockCreateGroupPayload
): Promise<RockGroup> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);
  schema.parse(data);

  const body: Record<string, any> = {
    Name: data.name,
    GroupTypeId: data.groupTypeId || RockGroupType.ConnectGroup,
    IsActive: data.isActive !== false,
  };
  if (data.campusId) body.CampusId = data.campusId;
  if (data.description) body.Description = data.description;
  if (data.parentGroupId) body.ParentGroupId = data.parentGroupId;
  if (data.capacity) body.GroupCapacity = data.capacity;

  const result = await rockPost('/Groups', body);
  revalidateTag('rock:groups');
  await rockClearGroupHierarchyCache();

  if (typeof result === 'number') {
    return rockGet(`/Groups/${result}`, undefined, true);
  }

  return result;
}
