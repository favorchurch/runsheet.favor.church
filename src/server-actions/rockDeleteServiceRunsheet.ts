'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

/** Rock throttles bursts, so item deletes go out a few at a time rather than all at once. */
const ITEM_DELETE_BATCH_SIZE = 5;

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
      // Already gone (double click, second tab, another editor): the goal state is met.
      if (access.notFound) return { success: true };
      return { success: false, error: access.error };
    }

    // 1. Fetch items attached to the ContentChannel. Uncached: a stale list
    // would miss recently added rows and leave the channel undeletable.
    const items = (await rockGet(
      '/ContentChannelItems',
      { $filter: `ContentChannelId eq ${channelId}`, $select: 'Id' },
      true,
    )) as Array<{ Id: number }> | null;

    // 2. Delete item rows first to prevent FK constraint issues
    const itemIds = (items || []).map((item) => item.Id);
    for (let i = 0; i < itemIds.length; i += ITEM_DELETE_BATCH_SIZE) {
      await Promise.all(
        itemIds
          .slice(i, i + ITEM_DELETE_BATCH_SIZE)
          .map((itemId) => rockDelete(`/ContentChannelItems/${itemId}`, undefined, [404])),
      );
    }

    // 3. Delete the ContentChannel (404 = already gone, so a retry after a
    // partial failure finishes the job instead of erroring).
    await rockDelete(`/ContentChannels/${channelId}`, undefined, [404]);

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting runsheet content channel:', err);
    return { success: false, error: 'Failed to delete runsheet. Some rows may have been removed; please try deleting again.' };
  }
}
