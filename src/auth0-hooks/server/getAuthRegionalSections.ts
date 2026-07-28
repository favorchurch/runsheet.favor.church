'use server';

import { SectionAccess } from '@/types/AuthUser';
import { getAuthAccess } from './getAuthAccess';

export async function getAuthRegionalSections(): Promise<SectionAccess[]> {
  const sections = (await getAuthAccess()).regionalLeaderSections;
  if (!sections.length) {
    throw new Error('this section is for regional leaders only');
  }
  return sections;
}
