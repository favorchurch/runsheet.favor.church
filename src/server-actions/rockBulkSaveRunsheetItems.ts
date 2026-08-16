'use server';

import { readRunsheetCellValue } from '@/constants/runsheetColumns';
import { htmlToPlainText } from '@/lib/richText';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { BulkSaveResult, DynamicAttributeColumn, ItemResult, RunsheetItemRow } from '@/types/Runsheet';

/** Rock's `ContentChannelItem` entity type, used to find item attributes. */
const CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID = 208;

/** `Approved` on Rock's ContentChannelItem status enum. */
const CONTENT_CHANNEL_ITEM_STATUS_APPROVED = 2;

/**
 * Attribute id for `DURATION` on Favor's runsheet channels, used when the
 * channel's own attribute list does not include it (the grid filters DURATION
 * out of its columns, so it is not always present in what the client sends).
 */
const FALLBACK_DURATION_ATTRIBUTE_ID = 8432;

interface ResolvedChannel {
  contentChannelTypeId: number;
  columns: DynamicAttributeColumn[];
}

const INVALID_ITEM_ERROR = 'One or more runsheet items are not part of this runsheet.';

/** Returns the existing item ids so a client cannot write another channel's rows. */
async function fetchChannelItemIds(channelId: number): Promise<Set<number>> {
  const rawItems = (await rockGet(
    '/ContentChannelItems',
    {
      $filter: `ContentChannelId eq ${channelId}`,
      $select: 'Id',
      $top: 5000,
    },
    true,
  )) as Array<{ Id?: number }> | null;

  return new Set(
    (rawItems || [])
      .map((item) => item?.Id)
      .filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0),
  );
}

/** Reads a channel's type and item attributes straight from Rock. */
async function resolveChannel(channelId: number): Promise<ResolvedChannel> {
  const channel = (await rockGet(`/ContentChannels/${channelId}`, undefined, true)) as {
    ContentChannelTypeId: number;
    ItemsManuallyOrdered: boolean;
  } | null;
  if (!channel?.ContentChannelTypeId) {
    throw new Error(`Content Channel ${channelId} not found`);
  }

  // Without this, Rock's own admin grid ignores our `Order` field and falls
  // back to sorting items by StartDateTime descending — showing the runsheet
  // bottom-to-top. Self-heals channels created before this flag was set.
  if (!channel.ItemsManuallyOrdered) {
    await rockPatch(`/ContentChannels/${channelId}`, { ItemsManuallyOrdered: true });
  }

  const rawAttrs = (await rockGet(
    '/Attributes',
    {
      $filter:
        `EntityTypeId eq ${CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID} and ` +
        `((EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${channel.ContentChannelTypeId}') or ` +
        `(EntityTypeQualifierColumn eq 'ContentChannelId' and EntityTypeQualifierValue eq '${channelId}'))`,
      $orderby: 'Order asc,Id asc',
    },
    true,
  )) as any[];

  return {
    contentChannelTypeId: channel.ContentChannelTypeId,
    columns: (rawAttrs || []).map((attr) => ({
      id: attr.Id,
      key: attr.Key,
      name: attr.Name,
      fieldTypeId: attr.FieldTypeId,
    })),
  };
}

/**
 * Fetches every existing AttributeValue for one item in a single request.
 *
 * `EntityId` is only unique per attribute, so the attribute ids are part of the
 * filter — an EntityId-only query would also match rows belonging to other
 * entity types that happen to share the id.
 */
async function fetchExistingValueIds(itemId: number, attributeIds: number[]): Promise<Map<number, number>> {
  const byAttributeId = new Map<number, number>();
  if (attributeIds.length === 0) return byAttributeId;

  const attributeFilter = attributeIds.map((id) => `AttributeId eq ${id}`).join(' or ');
  const existing = (await rockGet(
    '/AttributeValues',
    { $filter: `EntityId eq ${itemId} and (${attributeFilter})`, $select: 'Id,AttributeId' },
    true,
  )) as any[];

  for (const value of existing || []) {
    if (value?.AttributeId && value?.Id && !byAttributeId.has(value.AttributeId)) {
      byAttributeId.set(value.AttributeId, value.Id);
    }
  }

  return byAttributeId;
}

async function saveAttributeValue(
  existingValueIds: Map<number, number>,
  attributeId: number,
  entityId: number,
  value: string,
) {
  const existingId = existingValueIds.get(attributeId);

  if (existingId) {
    await rockPatch(`/AttributeValues/${existingId}`, { Value: value });
  } else if (value) {
    // Nothing stored and nothing to store: skip rather than write an empty row.
    await rockPost('/AttributeValues', { AttributeId: attributeId, EntityId: entityId, Value: value });
  }
}

/**
 * Persists a runsheet: deletes removed segments, creates or updates the
 * rest, and writes dynamic attribute values. Supports incremental save via `changedKeys`.
 */
export async function rockBulkSaveRunsheetItems(
  channelId: number,
  items: RunsheetItemRow[],
  deletedItemIds: (number | string)[],
  columns?: DynamicAttributeColumn[],
  subtitle?: string,
  startTime?: string,
): Promise<BulkSaveResult> {
  try {
    if (!Number.isSafeInteger(channelId) || channelId <= 0) {
      return { success: false, error: 'Invalid runsheet.' };
    }

    const session = await getRockSession();
    // This must precede every write, including the self-healing
    // ItemsManuallyOrdered patch inside resolveChannel below.
    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const existingItemIds = await fetchChannelItemIds(channelId);
    const numericDeletedIds = deletedItemIds.filter(
      (deletedId): deletedId is number =>
        typeof deletedId === 'number' &&
        Number.isSafeInteger(deletedId) &&
        deletedId > 0,
    );
    const itemIdsToDelete = numericDeletedIds.filter((deletedId) => existingItemIds.has(deletedId));
    const hasInvalidDeletedId = numericDeletedIds.length !== itemIdsToDelete.length;
    const hasInvalidExistingItem = items.some((item) => {
      const isNewItem = typeof item.id === 'string' || item.isNew;
      if (isNewItem) return false;
      return typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || !existingItemIds.has(item.id);
    });

    if (hasInvalidDeletedId || hasInvalidExistingItem) {
      return { success: false, error: INVALID_ITEM_ERROR };
    }

    // Resolve metadata only after the payload has passed the ownership check.
    // This may self-heal ItemsManuallyOrdered, so it remains after the shared
    // authorization gate and before any client-requested mutation.
    const channel = await resolveChannel(channelId);

    if (subtitle !== undefined) {
      await rockPatch(`/ContentChannels/${channelId}`, { Description: subtitle });
    }

    // Stored in Rock's `ForeignKey` field — a free-text field reserved for
    // external app bookkeeping — so Start Time never touches the channel's
    // Name/Description, keeping it fully independent of the runsheet title.
    if (startTime !== undefined) {
      await rockPatch(`/ContentChannels/${channelId}`, { ForeignKey: startTime });
    }

    // 1. Delete removed items in parallel
    const deletePromises = itemIdsToDelete.map((deletedId) => rockDelete(`/ContentChannelItems/${deletedId}`));

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 2. Use the channel & attribute metadata resolved above
    const allAttributeColumns = (columns?.length ? columns : channel.columns).filter(
      (col) => col.id && col.key !== 'DURATION' && col.key !== 'SONGITEMID',
    );

    const durationAttributeId =
      channel.columns.find((col) => col.key === 'DURATION')?.id ?? FALLBACK_DURATION_ATTRIBUTE_ID;
    const songItemIdAttributeId = channel.columns.find((col) => col.key === 'SONGITEMID')?.id;

    // 3. Process all items in parallel with Promise.allSettled to track individual results
    const itemSettledResults = await Promise.allSettled(
      items.map(async (item): Promise<ItemResult> => {
        const isNewItem = typeof item.id === 'string' || item.isNew;
        const changedKeys = item.changedKeys; // undefined means full write path

        const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
        const plainTitle = htmlToPlainText(richTitle) || 'New Segment';

        let itemId: number;

        const validStartDateTime =
          item.startDateTime && (item.startDateTime.includes('T') || item.startDateTime.includes('-'))
            ? new Date(item.startDateTime).toISOString()
            : undefined;

        // Check which fields need to be patched for ContentChannelItem
        const shouldPatchTitle = !changedKeys || changedKeys.includes('title') || changedKeys.includes('ACTIVITYTITLE');
        const shouldPatchOrder = !changedKeys || changedKeys.includes('order');
        const shouldPatchStart = !changedKeys || changedKeys.includes('startDateTime');

        if (isNewItem) {
          const postPayload: Record<string, any> = {
            ContentChannelId: channelId,
            ContentChannelTypeId: channel.contentChannelTypeId,
            Title: plainTitle,
            Order: item.order,
            Status: CONTENT_CHANNEL_ITEM_STATUS_APPROVED,
          };
          if (validStartDateTime) {
            postPayload.StartDateTime = validStartDateTime;
          }

          const created = await rockPost('/ContentChannelItems', postPayload);
          itemId = typeof created === 'number' ? created : created?.Id || created?.id || Number(created);
        } else {
          itemId = Number(item.id);
          const patchPayload: Record<string, any> = {};
          if (shouldPatchTitle) patchPayload.Title = plainTitle;
          if (shouldPatchOrder) patchPayload.Order = item.order;
          if (validStartDateTime && shouldPatchStart) {
            patchPayload.StartDateTime = validStartDateTime;
          }

          if (Object.keys(patchPayload).length > 0) {
            await rockPatch(`/ContentChannelItems/${itemId}`, patchPayload);
          }
        }

        if (!itemId || Number.isNaN(itemId) || itemId <= 0) {
          return { clientId: item.id, ok: false, error: 'Invalid Item ID returned from Rock' };
        }

        // Filter attribute columns to write based on changedKeys (if defined)
        const attributeColumnsToWrite = changedKeys
          ? allAttributeColumns.filter((col) => changedKeys.includes(col.key))
          : allAttributeColumns;

        const shouldWriteDuration = !changedKeys || changedKeys.includes('DURATION') || changedKeys.includes('duration');
        const shouldWriteSongItemId =
          songItemIdAttributeId && (!changedKeys || changedKeys.includes('SONGITEMID') || changedKeys.includes('songItemId'));

        const targetAttributeIds: number[] = [
          ...attributeColumnsToWrite.map((col) => col.id),
          ...(shouldWriteDuration ? [durationAttributeId] : []),
          ...(shouldWriteSongItemId ? [songItemIdAttributeId] : []),
        ];

        // For brand new items, we know no attribute values exist yet — skip the extra GET query
        const existingValueIds = isNewItem || targetAttributeIds.length === 0
          ? new Map<number, number>()
          : await fetchExistingValueIds(itemId, targetAttributeIds);

        // Save target attribute values concurrently
        const savePromises: Promise<void>[] = [];

        for (const col of attributeColumnsToWrite) {
          const value =
            col.key === 'ACTIVITYTITLE' && item.attributeValues?.ACTIVITYTITLE === undefined
              ? richTitle
              : readRunsheetCellValue(item, col.key);

          savePromises.push(saveAttributeValue(existingValueIds, col.id, itemId, value));
        }

        if (shouldWriteDuration) {
          savePromises.push(
            saveAttributeValue(existingValueIds, durationAttributeId, itemId, String(item.duration || 0)),
          );
        }

        if (shouldWriteSongItemId && songItemIdAttributeId) {
          savePromises.push(
            saveAttributeValue(
              existingValueIds,
              songItemIdAttributeId,
              itemId,
              item.songItemId != null ? String(item.songItemId) : '',
            ),
          );
        }

        if (savePromises.length > 0) {
          await Promise.all(savePromises);
        }

        return { clientId: item.id, rockId: itemId, ok: true };
      }),
    );

    const itemResults: ItemResult[] = itemSettledResults.map((res, index) => {
      if (res.status === 'fulfilled') {
        return res.value;
      }
      return {
        clientId: items[index].id,
        ok: false,
        error: 'Failed to save item',
      };
    });

    const hasErrors = itemResults.some((r) => !r.ok);
    return {
      success: !hasErrors,
      results: itemResults,
      ...(hasErrors ? { error: 'Some items failed to save' } : {}),
    };
  } catch (err: any) {
    console.error('Error bulk-saving runsheet items:', err);
    return { success: false, error: 'Failed to save changes to Rock' };
  }
}
