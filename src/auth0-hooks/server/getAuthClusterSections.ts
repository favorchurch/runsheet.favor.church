'use server';

import { SectionAccess } from '@/types/AuthUser';
import { getAuthAccess } from './getAuthAccess';

export async function getAuthClusterSections(): Promise<SectionAccess[]> {
  const sections = (await getAuthAccess()).clusterHeadSections;
  if (!sections.length) {
    throw new Error('this section is for cluster heads only');
  }
  return sections;
}
