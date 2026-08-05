'use server';

import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { RunsheetItemRow } from '@/types/Runsheet';

export async function rockCreateServiceRunsheet(title: string, contentChannelTypeId: number, categoryId?: number) {
  try {
    await getRockSession();
    // 1. Create the Content Channel in Rock RMS using the selected ContentChannelTypeId
    const result = await rockPost('/ContentChannels', {
      Name: title,
      ContentChannelTypeId: contentChannelTypeId,
      RequiresApproval: false,
      IsIndexEnabled: true,
      EnablePersonalization: true,
      IsStructuredContent: true,
      // Without this, Rock's own admin grid ignores our `Order` field and
      // falls back to sorting items by StartDateTime descending — showing
      // the runsheet bottom-to-top.
      ItemsManuallyOrdered: true,
    });

    // Rock RMS POST returns either the integer ID directly (e.g. 21) or an object { Id: 21 }
    const channelId: number = typeof result === 'number' ? result : (result?.Id || result?.id || Number(result));

    if (!channelId || isNaN(channelId)) {
      throw new Error('Failed to retrieve new ContentChannel ID from Rock RMS response');
    }

    // 2. If a category was selected, associate it with the created ContentChannel
    if (categoryId) {
      try {
        await rockPost(`/Categories/CategoryItem`, {
          CategoryId: categoryId,
          EntityId: channelId,
        });
      } catch (catErr) {
        console.warn('Could not attach category to ContentChannel:', catErr);
      }
    }

    // 3. Automatically populate the default runsheet template items
    let preparedItems: RunsheetItemRow[] = [];
    try {
      preparedItems = DEFAULT_RUNSHEET_TEMPLATE.map((row, idx) => ({
        id: `new_${idx}_${Date.now()}`,
        isNew: true,
        title: row.title,
        duration: row.duration,
        attributeValues: {
          ACTIVITYTITLE: row.activityTitle || row.title,
          DESCRIPTION: row.detail,
          DETIAL: row.detail,
        },
        detail: row.detail,
        order: idx + 1,
        anchorPreacher: '',
        mainInstrument: '',
        ledLiveScreens: '',
        overlayBroadcast: '',
        lighting: '',
        audio: '',
      }));

      await rockBulkSaveRunsheetItems(channelId, preparedItems, []);
    } catch (templateErr) {
      console.warn('Could not populate initial template items:', templateErr);
    }

    return {
      success: true,
      id: channelId,
      data: {
        channelId,
        name: title,
        contentChannelTypeId,
        columns: [],
        items: preparedItems,
      },
    };
  } catch (err: any) {
    console.error('Error creating content channel:', err);
    return { success: false, error: err.message || 'Unknown error occurred' };
  }
}
