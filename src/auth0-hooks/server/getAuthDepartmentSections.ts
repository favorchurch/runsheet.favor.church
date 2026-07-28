'use server';

import { SectionAccess } from '@/types/AuthUser';
import { getAuthAccess } from './getAuthAccess';

export async function getAuthDepartmentSections(): Promise<SectionAccess[]> {
  const sections = (await getAuthAccess()).departmentHeadSections;
  if (!sections.length) {
    throw new Error('this section is for department heads or connect team admins only');
  }
  return sections;
}
