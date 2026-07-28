'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleSectionId } from '@/auth0-hooks/server/assertAccessibleSectionId';
import { rockGet, rockPatch } from '@/server-actions/internal/rockFetch';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { revalidateTag } from 'next/cache';
import { number, object, string } from 'zod';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';

const schema = object({
  sectionId: number().int().positive(),
  name: string().trim().min(1),
});

/**
 * Rename a 'Cluster //' / 'Region //' section group in Rock.
 *
 * Hierarchy detection is name-prefix based (rockGetScopedGroupHierarchy matches
 * `Name.startsWith('Cluster //')`), so the new name must keep the exact prefix
 * of the section's current kind — otherwise the section (and every connect
 * group under it) would silently drop out of the cluster/region hierarchy.
 */
export async function rockPerformUpdateSection(sectionId: number, updates: { name: string }): Promise<RockGroup> {
  await assertAuthenticated();
  schema.parse({ sectionId, name: updates.name });
  await assertAccessibleSectionId(sectionId);

  const current: RockGroup = await rockGet(`/Groups/${sectionId}`, {
    $select: 'Id,Name,GroupTypeId',
  });
  if (current.GroupTypeId !== RockGroupType.ConnectGroupSection) {
    throw new Error(`Group ${sectionId} is not a connect group section`);
  }
  const currentKind = current.Name?.startsWith('Cluster //')
    ? 'Cluster'
    : current.Name?.startsWith('Region //')
      ? 'Region'
      : null;
  if (!currentKind) {
    throw new Error(`Section ${sectionId} is not a 'Cluster //' or 'Region //' section`);
  }

  const name = updates.name.trim();
  const prefix = `${currentKind} // `;
  if (!name.startsWith(prefix) || !name.slice(prefix.length).trim()) {
    throw new Error(`Section name must be '${prefix}<name>'`);
  }

  const result = await rockPatch(`/Groups/${sectionId}`, { Name: name });
  revalidateTag('rock:groups');
  await rockClearGroupHierarchyCache();
  return result;
}
