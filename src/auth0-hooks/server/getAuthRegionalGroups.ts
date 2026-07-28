'use server';

import { rockExpandSectionIdsToConnectGroupIds } from '@/server-actions/rockExpandSectionIdsToConnectGroupIds';
import { getAuthRegionalSections } from './getAuthRegionalSections';

/**
 * Make sure to wrap parent component with "withPageAuthRequired"
 */
export async function getAuthRegionalGroups(): Promise<number[]> {
  try {
    const sections = await getAuthRegionalSections();
    const groups = await rockExpandSectionIdsToConnectGroupIds(sections.map((section) => section.sectionId));
    if (!groups.length) {
      throw new Error('no regional groups found');
    }
    return groups;
  } catch (err) {
    throw new Error('this section is for regional leaders only');
  }
}
