'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

export async function rockDeleteServiceRunsheet(channelId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (!Number.isSafeInteger(channelId) || channelId <= 0) {
      return { success: false, error: 'Invalid runsheet.' };
    }

    const session = await getRockSession();
    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    // 1. Fetch items attached to the ContentChannel
    const items = (await rockGet('/ContentChannelItems', {
      $filter: `ContentChannelId eq ${channelId}`,
      $select: 'Id',
    })) as Array<{ Id: number }> | null;

    // 2. Delete item rows first to prevent FK constraint issues
    if (items && items.length > 0) {
      await Promise.all(
        items.map((item) => rockDelete(`/ContentChannelItems/${item.Id}`, undefined, [404]))
      );
    }

    // 3. Delete the ContentChannel
    await rockDelete(`/ContentChannels/${channelId}`);

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting runsheet content channel:', err);
    return { success: false, error: 'Failed to delete runsheet.' };
  }
}
