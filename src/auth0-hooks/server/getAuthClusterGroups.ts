'use server';

import { rockExpandSectionIdsToConnectGroupIds } from '@/server-actions/rockExpandSectionIdsToConnectGroupIds';
import { getAuthClusterSections } from './getAuthClusterSections';

/**
 * Make sure to wrap parent component with "withPageAuthRequired"
 */
export async function getAuthClusterGroups(): Promise<number[]> {
  try {
    const sections = await getAuthClusterSections();
    const groups = await rockExpandSectionIdsToConnectGroupIds(sections.map((section) => section.sectionId));
    if (!groups.length) {
      throw new Error('no cluster groups found');
    }
    return groups;
  } catch (err) {
    throw new Error('this section is for cluster heads only');
  }
}
