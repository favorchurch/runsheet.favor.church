'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { extractRunsheetCampus, extractRunsheetCampuses } from '@/lib/runsheetCampus';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import { rockEnsureRunsheetTemplate } from '@/server-actions/rockEnsureRunsheetTemplate';
import { buildDefaultTemplateItems } from '@/lib/runsheetTemplate';
import { SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { RunsheetItemRow } from '@/types/Runsheet';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

/** The campus template's rows as unsaved items, or [] if it can't be used. */
async function loadCampusTemplateItems(title: string): Promise<RunsheetItemRow[]> {
  const campus = extractRunsheetCampus(title);
  if (!campus) return [];

  const template = await rockEnsureRunsheetTemplate(campus);
  if (!template.success || !template.id) return [];

  const details = await rockGetRunsheetDetails(template.id);
  if (!details.success || !details.data) return [];

  const stamp = Date.now();
  return details.data.items.map((row, idx) => ({
    ...row,
    id: `new_${idx}_${stamp}`,
    isNew: true,
    changedKeys: undefined,
    order: idx + 1,
    // A fresh runsheet must not inherit the template's cross-service keys.
    attributeValues: { ...row.attributeValues, [SIBLINGKEY_ATTRIBUTE_KEY]: '' },
  }));
}

export async function rockCreateServiceRunsheet(title: string, contentChannelTypeId: number, categoryId?: number) {
  try {
    const session = await getRockSession();

    const access = await assertRunsheetEditAccess(session, title);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    if (extractRunsheetCampuses(title).length !== 1) {
      return { success: false, error: 'Runsheet titles must contain exactly one campus marker.' };
    }

    if (contentChannelTypeId !== RUNSHEET_CONTENT_CHANNEL_TYPE_ID) {
      return { success: false, error: 'Invalid runsheet content channel type.' };
    }

    // 1. Create the Content Channel in Rock RMS using the selected ContentChannelTypeId
    const result = await rockPost('/ContentChannels', {
      Name: title,
      ContentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
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

    // 3. Populate from the campus's master template, falling back to the
    //    hardcoded default so a new runsheet is never left empty.
    let preparedItems: RunsheetItemRow[] = [];
    try {
      preparedItems = await loadCampusTemplateItems(title);
    } catch (templateErr) {
      console.warn('Could not load campus master template, using default:', templateErr);
    }
    if (preparedItems.length === 0) preparedItems = buildDefaultTemplateItems();

    try {
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
        contentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
        columns: [],
        items: preparedItems,
      },
    };
  } catch (err: any) {
    console.error('Error creating content channel:', err);
    return { success: false, error: 'Failed to create runsheet.' };
  }
}
