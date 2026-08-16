'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { canAccessRunsheetChannel, ALL_CAMPUSES } from '@/lib/runsheetCampus';
import type { DynamicAttributeColumn, RunsheetItemRow, RunsheetDetails } from '@/types/Runsheet';

export async function rockDuplicateServiceRunsheet(
  sourceChannelId: number,
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

    // 1. Enforce campus gating permissions on target runsheet title
    if (!canAccessRunsheetChannel(session?.access?.runsheetCampuses, targetTitle)) {
      const allowed = (session?.access?.runsheetCampuses || [])
        .filter((c) => c !== ALL_CAMPUSES)
        .join(', ');
      return {
        success: false,
        error: `You are only authorized to create runsheets for your assigned campus (${allowed || 'none'}).`,
      };
    }

    // 2. Create the new ContentChannel in Rock RMS
    const result = await rockPost('/ContentChannels', {
      Name: targetTitle,
      ContentChannelTypeId: contentChannelTypeId,
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
        contentChannelTypeId,
        columns: columns || [],
        items: preparedItems,
      },
    };
  } catch (err: any) {
    console.error('Error duplicating runsheet:', err);
    return {
      success: false,
      error: err?.message || 'Failed to duplicate runsheet.',
    };
  }
}
