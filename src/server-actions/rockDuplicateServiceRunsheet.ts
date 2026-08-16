'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { extractRunsheetCampuses } from '@/lib/runsheetCampus';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { DynamicAttributeColumn, RunsheetItemRow, RunsheetDetails } from '@/types/Runsheet';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

export async function rockDuplicateServiceRunsheet(
  targetTitle: string,
  contentChannelTypeId: number = 13,
  categoryId?: number,
  itemsToDuplicate: RunsheetItemRow[] = [],
  columns?: DynamicAttributeColumn[],
): Promise<{
  success: boolean;
  id?: number;
  data?: RunsheetDetails;
  error?: string;
}> {
  try {
    const session = await getRockSession();

    // 1. Enforce edit and campus gating before any Rock mutation.
    const access = await assertRunsheetEditAccess(session, targetTitle);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    if (extractRunsheetCampuses(targetTitle).length !== 1) {
      return { success: false, error: 'Runsheet titles must contain exactly one campus marker.' };
    }

    if (contentChannelTypeId !== RUNSHEET_CONTENT_CHANNEL_TYPE_ID) {
      return { success: false, error: 'Invalid runsheet content channel type.' };
    }

    // 2. Create the new ContentChannel in Rock RMS
    const result = await rockPost('/ContentChannels', {
      Name: targetTitle,
      ContentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
      RequiresApproval: false,
      IsIndexEnabled: true,
      EnablePersonalization: true,
      IsStructuredContent: true,
      ItemsManuallyOrdered: true,
    });

    const newChannelId: number = typeof result === 'number' ? result : (result?.Id || result?.id || Number(result));

    if (!newChannelId || isNaN(newChannelId)) {
      throw new Error('Failed to retrieve new ContentChannel ID from Rock RMS response');
    }

    // 3. Associate category if specified
    if (categoryId) {
      try {
        await rockPost('/Categories/CategoryItem', {
          CategoryId: categoryId,
          EntityId: newChannelId,
        });
      } catch (catErr) {
        console.warn('Could not attach category to duplicated ContentChannel:', catErr);
      }
    }

    // 4. Clone all items into the new runsheet channel
    const preparedItems: RunsheetItemRow[] = itemsToDuplicate.map((row, idx) => ({
      ...row,
      id: `dup_${idx}_${Date.now()}`,
      isNew: true,
      order: idx + 1,
    }));

    if (preparedItems.length > 0) {
      await rockBulkSaveRunsheetItems(newChannelId, preparedItems, [], columns);
    }

    return {
      success: true,
      id: newChannelId,
      data: {
        channelId: newChannelId,
        name: targetTitle,
        contentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
        columns: columns || [],
        items: preparedItems,
      },
    };
  } catch (err: any) {
    console.error('Error duplicating runsheet:', err);
    return {
      success: false,
      error: 'Failed to duplicate runsheet.',
    };
  }
}
