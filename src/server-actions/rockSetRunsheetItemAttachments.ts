'use server';

import { z } from 'zod';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { PREACHER_NOTES_ATTRIBUTE_KEY, serializeAttachments, type RunsheetAttachment } from '@/lib/runsheetAttachments';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

/** `ContentChannelItem`; the entity the `PREACHERNOTES` attribute hangs off. Verified 208 on Rock. */
const CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID = 208;

const attachmentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  uploadedAt: z.string().min(1),
});

const inputSchema = z.object({
  channelId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  attachments: z.array(attachmentSchema).max(500),
});

/**
 * Writes the whole attachment list for one runsheet row.
 *
 * Called immediately after each upload or delete, so the row is persisted
 * without waiting for the grid's own save.
 */
export async function rockSetRunsheetItemAttachments(input: {
  channelId: number;
  itemId: number;
  attachments: RunsheetAttachment[];
}): Promise<{ success: boolean; error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid attachment data.' };
  }
  const { channelId, itemId, attachments } = parsed.data;

  const session = await getRockSession();
  const access = await assertRunsheetEditAccess(session, channelId);
  if (!access.allowed) {
    return { success: false, error: access.error };
  }

  try {
    const attributes = (await rockGet(
      '/Attributes',
      {
        $filter:
          `Key eq '${PREACHER_NOTES_ATTRIBUTE_KEY}' and ` +
          `EntityTypeId eq ${CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID}`,
        $select: 'Id,Key',
      },
      true,
    )) as { Id?: number }[] | null;

    const attributeId = attributes?.[0]?.Id;
    if (!attributeId) {
      return { success: false, error: 'This runsheet does not have attachments enabled.' };
    }

    const existing = (await rockGet(
      '/AttributeValues',
      { $filter: `EntityId eq ${itemId} and AttributeId eq ${attributeId}`, $select: 'Id,AttributeId' },
      true,
    )) as { Id?: number }[] | null;

    const value = serializeAttachments(attachments);
    const existingId = existing?.[0]?.Id;

    if (existingId) {
      await rockPatch(`/AttributeValues/${existingId}`, { Value: value });
    } else if (value) {
      await rockPost('/AttributeValues', { AttributeId: attributeId, EntityId: itemId, Value: value });
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Could not save attachments to Rock.' };
  }
}
