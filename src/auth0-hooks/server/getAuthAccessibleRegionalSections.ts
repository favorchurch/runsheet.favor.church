'use server';

import { rockExpandSectionIdsToChildSections } from '@/server-actions/rockExpandSectionIdsToChildSections';
import { SectionAccess } from '@/types/AuthUser';
import { uniqBy } from 'lodash';
import { getAuthAccess } from './getAuthAccess';
import { foldSectionsByName } from './foldSectionsByName';

export async function getRawAuthAccessibleRegionalSections(): Promise<SectionAccess[]> {
  const access = await getAuthAccess();
  const owned = access.regionalLeaderSections;
  const parentSectionIds = [
    ...access.clusterHeadSections.map((s) => s.sectionId),
    ...access.departmentHeadSections.map((s) => s.sectionId),
  ];
  const viaParents = parentSectionIds.length
    ? await rockExpandSectionIdsToChildSections(parentSectionIds, 'region')
    : [];
  return uniqBy([...owned, ...viaParents], 'sectionId');
}

/**
 * Region sections the current user may view: their own regional-leader sections
 * plus every region section nested under any cluster they head or department they
 * head (the BFS descends department -> cluster -> region).
 * Returns [] (does not throw) when the user can reach no regions.
 */
export async function getAuthAccessibleRegionalSections(): Promise<SectionAccess[]> {
  const raw = await getRawAuthAccessibleRegionalSections();
  return foldSectionsByName(raw);
}
