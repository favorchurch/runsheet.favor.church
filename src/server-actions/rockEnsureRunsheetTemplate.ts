'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import { RUNSHEET_CAMPUS_CODES, type RunsheetCampusCode } from '@/lib/runsheetCampus';
import { buildDefaultTemplateItems, masterTemplateName } from '@/lib/runsheetTemplate';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

/**
 * Finds the campus's master template channel, creating and seeding it on
 * first use. The name carries the campus marker, so the standard edit gate
 * isolates campuses. Concurrent first use can create two channels; the
 * oldest always wins, so the duplicate is inert.
 */
export async function rockEnsureRunsheetTemplate(
  campus: RunsheetCampusCode,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!RUNSHEET_CAMPUS_CODES.includes(campus)) {
      return { success: false, error: 'Unknown campus.' };
    }

    const name = masterTemplateName(campus);
    const session = await getRockSession();
    const access = await assertRunsheetEditAccess(session, name);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const existing = (await rockGet('/ContentChannels', {
      $filter: `ContentChannelTypeId eq ${RUNSHEET_CONTENT_CHANNEL_TYPE_ID} and Name eq '${name}'`,
      $select: 'Id',
      $orderby: 'Id asc',
      $top: 1,
    })) as Array<{ Id: number }> | null;

    if (existing && existing.length > 0) {
      return { success: true, id: existing[0].Id };
    }

    const result = await rockPost('/ContentChannels', {
      Name: name,
      ContentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
      RequiresApproval: false,
      IsIndexEnabled: true,
      EnablePersonalization: true,
      IsStructuredContent: true,
      ItemsManuallyOrdered: true,
    });

    const channelId: number = typeof result === 'number' ? result : (result?.Id || result?.id || Number(result));
    if (!channelId || isNaN(channelId)) {
      throw new Error('Failed to retrieve new ContentChannel ID from Rock RMS response');
    }

    await rockBulkSaveRunsheetItems(channelId, buildDefaultTemplateItems(), []);

    return { success: true, id: channelId };
  } catch (err) {
    console.error('Error ensuring runsheet master template:', err);
    return { success: false, error: 'Failed to find or create master template.' };
  }
}
