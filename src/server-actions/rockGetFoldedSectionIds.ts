'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup, RockGroupType } from '@/types/RockGroup';

export async function rockGetFoldedSectionIds(sectionId: number): Promise<{ canonicalId: number; allIds: number[] }> {
  await assertAuthenticated();
  if (!sectionId || typeof sectionId !== 'number') {
    return { canonicalId: sectionId, allIds: [sectionId] };
  }

  // 1. Fetch the target group details to get its name, type, and campus
  const groups: RockGroup[] = await rockGet('/Groups', {
    $filter: `Id eq ${sectionId}`,
    $select: 'Id,Name,GroupTypeId,CampusId',
  });

  const group = groups?.[0];
  if (!group || group.GroupTypeId !== RockGroupType.ConnectGroupSection) {
    return { canonicalId: sectionId, allIds: [sectionId] };
  }

  const name = group.Name || '';
  const cleanName = name.replace(/^(Cluster|Region)\s*\/\/\s*/i, '').trim();
  const prefix = name.startsWith('Region //') ? 'Region // ' : name.startsWith('Cluster //') ? 'Cluster // ' : '';
  const expectedName = `${prefix}${cleanName}`;
  const escapedExpectedName = expectedName.replace(/'/g, "''");

  const campusFilter = group.CampusId ? ` and CampusId eq ${group.CampusId}` : '';

  const siblings: RockGroup[] = await rockGet('/Groups', {
    $filter: `GroupTypeId eq ${RockGroupType.ConnectGroupSection} and Name eq '${escapedExpectedName}' and IsActive eq true${campusFilter}`,
    $select: 'Id',
    $orderby: 'Id asc',
  });

  if (siblings.length === 0) {
    return { canonicalId: sectionId, allIds: [sectionId] };
  }

  const allIds = siblings.map((s) => s.Id);
  const canonicalId = allIds[0];

  return { canonicalId, allIds };
}
