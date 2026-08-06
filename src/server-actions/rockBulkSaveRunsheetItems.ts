'use server';

import { readRunsheetCellValue } from '@/constants/runsheetColumns';
import { htmlToPlainText } from '@/lib/richText';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

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

/** Reads a channel's type and item attributes straight from Rock. */
async function resolveChannel(channelId: number): Promise<ResolvedChannel> {
  const channel = (await rockGet(`/ContentChannels/${channelId}`)) as {
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
 * Persists a whole runsheet: deletes removed segments, creates or updates the
 * rest, and writes each dynamic attribute value.
 *
 * Text cells hold rich-text HTML. Rock's own `ContentChannelItem.Title` column
 * is written as plain text so Rock's admin screens and search stay readable,
 * while the formatted version lives in the `ACTIVITYTITLE` attribute.
 */
export async function rockBulkSaveRunsheetItems(
  channelId: number,
  items: RunsheetItemRow[],
  deletedItemIds: (number | string)[],
  columns?: DynamicAttributeColumn[],
) {
  try {
    await getRockSession();

    // 1. Delete removed items in parallel
    const deletePromises = deletedItemIds
      .filter((deletedId): deletedId is number => typeof deletedId === 'number' && deletedId > 0)
      .map((deletedId) => rockDelete(`/ContentChannelItems/${deletedId}`));

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 2. Resolve channel & attribute metadata from Rock
    const channel = await resolveChannel(channelId);
    const attributeColumns = (columns?.length ? columns : channel.columns).filter(
      (col) => col.id && col.key !== 'DURATION' && col.key !== 'SONGITEMID',
    );

    const durationAttributeId =
      channel.columns.find((col) => col.key === 'DURATION')?.id ?? FALLBACK_DURATION_ATTRIBUTE_ID;
    const songItemIdAttributeId = channel.columns.find((col) => col.key === 'SONGITEMID')?.id;

    const attributeIds = [
      ...attributeColumns.map((col) => col.id),
      durationAttributeId,
      ...(songItemIdAttributeId ? [songItemIdAttributeId] : []),
    ];

    // 3. Process all items in parallel for maximum speed
    await Promise.all(
      items.map(async (item) => {
        const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
        const plainTitle = htmlToPlainText(richTitle) || 'New Segment';

        let itemId: number;
        const isNewItem = typeof item.id === 'string' || item.isNew;

        if (isNewItem) {
          const created = await rockPost('/ContentChannelItems', {
            ContentChannelId: channelId,
            ContentChannelTypeId: channel.contentChannelTypeId,
            Title: plainTitle,
            Order: item.order,
            Status: CONTENT_CHANNEL_ITEM_STATUS_APPROVED,
            StartDateTime: item.startDateTime || null,
          });

          itemId = typeof created === 'number' ? created : created?.Id || created?.id || Number(created);
        } else {
          itemId = Number(item.id);
          await rockPatch(`/ContentChannelItems/${itemId}`, {
            Title: plainTitle,
            Order: item.order,
            StartDateTime: item.startDateTime || null,
          });
        }

        if (!itemId || Number.isNaN(itemId) || itemId <= 0) return;

        // For brand new items, we know no attribute values exist yet — skip the extra GET query
        const existingValueIds = isNewItem
          ? new Map<number, number>()
          : await fetchExistingValueIds(itemId, attributeIds);

        // Save all attribute values for this item concurrently
        const savePromises: Promise<void>[] = [];

        for (const col of attributeColumns) {
          const value =
            col.key === 'ACTIVITYTITLE' && item.attributeValues?.ACTIVITYTITLE === undefined
              ? richTitle
              : readRunsheetCellValue(item, col.key);

          savePromises.push(saveAttributeValue(existingValueIds, col.id, itemId, value));
        }

        savePromises.push(
          saveAttributeValue(existingValueIds, durationAttributeId, itemId, String(item.duration || 0))
        );

        if (songItemIdAttributeId) {
          savePromises.push(
            saveAttributeValue(
              existingValueIds,
              songItemIdAttributeId,
              itemId,
              item.songItemId != null ? String(item.songItemId) : '',
            )
          );
        }

        await Promise.all(savePromises);
      })
    );

    return { success: true };
  } catch (err: any) {
    console.error('Error bulk-saving runsheet items:', err);
    return { success: false, error: err.message || 'Failed to save changes to Rock' };
  }
}
