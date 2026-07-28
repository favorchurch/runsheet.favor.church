'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { array, number, object } from 'zod';

const schema = object({
  groupIds: array(number().int().positive()),
});

export async function rockExpandGroupIds(
  groupIds: number[],
  select?: string
): Promise<RockGroup[]> {
  await assertAuthenticated();
  schema.parse({ groupIds });

  if (groupIds.length === 0) return [];

  return batchODataFilter(groupIds, 'Id', (idFilter) => {
    const params: Record<string, string | number> = {
      $filter: idFilter,
      $expand: 'Members,Members/Person,GroupType',
      $top: 5000,
      loadAttributes: 'True',
    };
    if (select) params.$select = select;
    return rockGet('/Groups', params);
  });
}
