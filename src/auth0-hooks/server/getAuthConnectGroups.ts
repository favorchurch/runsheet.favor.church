'use server';

import { getAuthAccess } from '@/auth0-hooks/server/getAuthAccess';
import { ConnectRole } from '@/types/ConnectRole';
import { getServerSession } from './getServerSession';

/**
 * Make sure to wrap parent component with "withPageAuthRequired"
 */
export async function getAuthConnectGroups(): Promise<number[]> {
  try {
    const access = await getAuthAccess();
    if (access.connectLeaderGroupIds.length > 0) {
      return access.connectLeaderGroupIds.map(Number);
    }

    const session = await getServerSession();
    const groups = session?.user?.rolesMap?.[ConnectRole.ConnectLeader];
    if (!(groups && groups.length > 0)) {
      throw new Error('No connect groups found');
    }
    return groups.map(Number);
  } catch (err) {
    throw new Error('this section is for connect leaders only');
  }
}
