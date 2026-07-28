import 'server-only';

import { rockGet } from '@/server-actions/internal/rockFetch';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { flatten, uniq } from 'lodash';
import { getAuthAccess } from './getAuthAccess';
import { getAuthClusterGroups } from './getAuthClusterGroups';
import { getAuthConnectGroups } from './getAuthConnectGroups';
import { getAuthRegionalGroups } from './getAuthRegionalGroups';

/**
 * Returns all campus IDs accessible to the current user.
 * Replaces getAuthAccessibleRealms (Fluro campuses → Rock campuses).
 */
export async function getAuthAccessibleCampuses(): Promise<number[]> {
  const results = await Promise.all([
    getAuthAccess()
      .then((access) => access.campusIds || [])
      .catch(() => [] as number[]),
    // Campuses from connect groups
    getAuthConnectGroups()
      .then((ids) => getGroupCampusIds(ids))
      .catch(() => []),
    // Campuses from regional groups
    getAuthRegionalGroups()
      .then((ids) => getGroupCampusIds(ids))
      .catch(() => []),
    // Campuses from cluster groups
    getAuthClusterGroups()
      .then((ids) => getGroupCampusIds(ids))
      .catch(() => []),
  ]);
  return uniq(flatten(results)).filter((id) => id > 0);
}

async function getGroupCampusIds(groupIds: number[]): Promise<number[]> {
  if (groupIds.length === 0) return [];

  const groups = await batchODataFilter<any>(groupIds, 'Id', (idFilter: string) =>
    rockGet('/Groups', {
      $filter: idFilter,
      $select: 'Id,CampusId',
      $top: 5000,
    })
  );

  return uniq(groups.map((g: any) => g.CampusId).filter(Boolean) as number[]);
}
