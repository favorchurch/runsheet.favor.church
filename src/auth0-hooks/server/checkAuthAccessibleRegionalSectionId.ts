import 'server-only';

import { getRawAuthAccessibleRegionalSections } from './getAuthAccessibleRegionalSections';
import { rockGetFoldedSectionIds } from '@/server-actions/rockGetFoldedSectionIds';

export async function checkAuthAccessibleRegionalSectionId(sectionId: number): Promise<boolean> {
  if (!sectionId || typeof sectionId !== 'number') {
    throw new Error('Invalid section ID');
  }
  const { allIds } = await rockGetFoldedSectionIds(sectionId);
  const sections = await getRawAuthAccessibleRegionalSections();
  return sections.some((s) => allIds.includes(s.sectionId));
}
