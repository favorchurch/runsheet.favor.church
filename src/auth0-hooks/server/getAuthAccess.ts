'use server';

import { AuthAccess } from '@/types/AuthUser';
import { getRockSession } from './getRockSession';

const EMPTY_ACCESS: AuthAccess = {
  connectLeaderGroupIds: [],
  regionalLeaderSections: [],
  clusterHeadSections: [],
  departmentHeadSections: [],
  campusIds: [],
};

export async function getAuthAccess(): Promise<AuthAccess> {
  try {
    const { access } = await getRockSession();
    return {
      connectLeaderGroupIds: access.connectLeaderGroupIds || [],
      regionalLeaderSections: access.regionalLeaderSections || [],
      clusterHeadSections: access.clusterHeadSections || [],
      departmentHeadSections: access.departmentHeadSections || [],
      campusIds: access.campusIds || [],
    };
  } catch {
    return EMPTY_ACCESS;
  }
}
