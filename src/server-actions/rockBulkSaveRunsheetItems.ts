'use server';

import { readRunsheetCellValue } from '@/constants/runsheetColumns';
import { htmlToPlainText } from '@/lib/richText';
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
  const channel = (await rockGet(`/ContentChannels/${channelId}`)) as { ContentChannelTypeId: number } | null;
  if (!channel?.ContentChannelTypeId) {
    throw new Error(`Content Channel ${channelId} not found`);
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
    for (const deletedId of deletedItemIds) {
      if (typeof deletedId === 'number' && deletedId > 0) {
        await rockDelete(`/ContentChannelItems/${deletedId}`);
      }
    }

    // The client sends the columns it rendered, but the channel type (needed to
    // create items) and the DURATION attribute id are only known from Rock.
    const channel = await resolveChannel(channelId);
    const attributeColumns = (columns?.length ? columns : channel.columns).filter(
      (col) => col.id && col.key !== 'DURATION',
    );

    const durationAttributeId =
      channel.columns.find((col) => col.key === 'DURATION')?.id ?? FALLBACK_DURATION_ATTRIBUTE_ID;

    const attributeIds = [...attributeColumns.map((col) => col.id), durationAttributeId];

    for (const item of items) {
      const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
      const plainTitle = htmlToPlainText(richTitle) || 'New Segment';

      let itemId: number;

      if (typeof item.id === 'string' || item.isNew) {
        const created = await rockPost('/ContentChannelItems', {
          ContentChannelId: channelId,
          ContentChannelTypeId: channel.contentChannelTypeId,
          Title: plainTitle,
          Order: item.order,
          Status: CONTENT_CHANNEL_ITEM_STATUS_APPROVED,
          StartDateTime: item.startDateTime || null,
        });

        // Rock returns either the new id directly or an object wrapping it.
        itemId = typeof created === 'number' ? created : created?.Id || created?.id || Number(created);
      } else {
        itemId = Number(item.id);
        await rockPatch(`/ContentChannelItems/${itemId}`, {
          Title: plainTitle,
          Order: item.order,
          StartDateTime: item.startDateTime || null,
        });
      }

      if (!itemId || Number.isNaN(itemId) || itemId <= 0) continue;

      const existingValueIds = await fetchExistingValueIds(itemId, attributeIds);

      for (const col of attributeColumns) {
        const value =
          col.key === 'ACTIVITYTITLE' && item.attributeValues?.ACTIVITYTITLE === undefined
            ? richTitle
            : readRunsheetCellValue(item, col.key);

        await saveAttributeValue(existingValueIds, col.id, itemId, value);
      }

      await saveAttributeValue(existingValueIds, durationAttributeId, itemId, String(item.duration || 0));
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error bulk-saving runsheet items:', err);
    return { success: false, error: err.message || 'Failed to save changes to Rock' };
  }
}
