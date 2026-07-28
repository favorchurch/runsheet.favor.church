import 'server-only';

import { rockExpandSectionIdsToConnectGroupIds } from '@/server-actions/rockExpandSectionIdsToConnectGroupIds';
import { uniq } from 'lodash';
import { getAuthClusterSections } from './getAuthClusterSections';
import { getAuthConnectGroups } from './getAuthConnectGroups';
import { getAuthDepartmentSections } from './getAuthDepartmentSections';
import { getAuthRegionalSections } from './getAuthRegionalSections';

export async function getAuthAccessibleGroupsIds(): Promise<number[]> {
  const [directConnectIds, regionalSections, clusterSections, departmentSections] = await Promise.all([
    getAuthConnectGroups().catch(() => [] as number[]),
    getAuthRegionalSections().catch(() => []),
    getAuthClusterSections().catch(() => []),
    getAuthDepartmentSections().catch(() => []),
  ]);

  const sectionIds = uniq([
    ...regionalSections.map(({ sectionId }) => sectionId),
    ...clusterSections.map(({ sectionId }) => sectionId),
    ...departmentSections.map(({ sectionId }) => sectionId),
  ]);
  const descendantConnectIds = sectionIds.length
    ? await rockExpandSectionIdsToConnectGroupIds(sectionIds)
    : [];

  return uniq([...directConnectIds, ...descendantConnectIds]) as number[];
}
