'use server';

import { rockExpandSectionIdsToChildSections } from '@/server-actions/rockExpandSectionIdsToChildSections';
import { SectionAccess } from '@/types/AuthUser';
import { uniqBy } from 'lodash';
import { getAuthAccess } from './getAuthAccess';

import { foldSectionsByName } from './foldSectionsByName';

export async function getRawAuthAccessibleClusterSections(): Promise<SectionAccess[]> {
  const access = await getAuthAccess();
  const owned = access.clusterHeadSections;
  const departmentSectionIds = access.departmentHeadSections.map((s) => s.sectionId);
  const viaDepartment = departmentSectionIds.length
    ? await rockExpandSectionIdsToChildSections(departmentSectionIds, 'cluster')
    : [];
  return uniqBy([...owned, ...viaDepartment], 'sectionId');
}

/**
 * Cluster sections the current user may view: their own cluster-head sections
 * plus every cluster section nested under any department they head.
 * Returns [] (does not throw) when the user can reach no clusters.
 */
export async function getAuthAccessibleClusterSections(): Promise<SectionAccess[]> {
  const raw = await getRawAuthAccessibleClusterSections();
  return foldSectionsByName(raw);
}
