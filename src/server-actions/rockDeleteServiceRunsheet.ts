'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserEditRunsheet } from '@/lib/permissions';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';

export async function rockDeleteServiceRunsheet(channelId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getRockSession();
    if (!canUserEditRunsheet(session)) {
      return { success: false, error: 'Unauthorized: Only editors can delete runsheets.' };
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
    return { success: false, error: err?.message || 'Failed to delete runsheet.' };
  }
}
