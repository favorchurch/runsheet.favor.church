'use server';

import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { uniqBy } from 'lodash';
import { getAuthAccessibleGroupsIds } from './getAuthAccessibleGroupsIds';

export async function getAuthAccessibleGroupsFull(
  select?: string
): Promise<RockGroup[]> {
  const groupIds = await getAuthAccessibleGroupsIds();
  if (groupIds.length === 0) return [];

  const groups = await batchODataFilter<any>(groupIds, 'Id', (idFilter: string) => {
    const params: Record<string, string | number> = {
      $filter: idFilter,
      $expand: 'Members,Members/Person,GroupType',
      $top: 5000,
    };
    if (select) {
      params.$select = select;
    }
    return rockGet('/Groups', params);
  });

  // Return only active groups
  return uniqBy(
    groups.filter((g: any) => g.IsActive !== false),
    'Id'
  );
}
