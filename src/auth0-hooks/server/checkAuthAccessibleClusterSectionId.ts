import 'server-only';

import { getRawAuthAccessibleClusterSections } from './getAuthAccessibleClusterSections';
import { rockGetFoldedSectionIds } from '@/server-actions/rockGetFoldedSectionIds';

export async function checkAuthAccessibleClusterSectionId(sectionId: number): Promise<boolean> {
  if (!sectionId || typeof sectionId !== 'number') {
    throw new Error('Invalid section ID');
  }
  const { allIds } = await rockGetFoldedSectionIds(sectionId);
  const sections = await getRawAuthAccessibleClusterSections();
  return sections.some((s) => allIds.includes(s.sectionId));
}
