'use server';

import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { RunsheetItemRow, DynamicAttributeColumn } from './rockGetRunsheetDetails';

export async function rockBulkSaveRunsheetItems(
  channelId: number,
  items: RunsheetItemRow[],
  deletedItemIds: (number | string)[],
  columns?: DynamicAttributeColumn[]
) {
  try {
    // 1. Process deletions
    for (const delId of deletedItemIds) {
      if (typeof delId === 'number' && delId > 0) {
        await rockDelete(`/ContentChannelItems/${delId}`);
      }
    }

    // 2. Fetch attribute columns from Rock RMS if not provided
    let attributeColumns = columns;
    if (!attributeColumns || attributeColumns.length === 0) {
      const channel = (await rockGet(`/ContentChannels/${channelId}`)) as { ContentChannelTypeId: number };
      if (channel?.ContentChannelTypeId) {
        const rawAttrs = (await rockGet(
          `/Attributes?$filter=EntityTypeId eq 208 and ((EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${channel.ContentChannelTypeId}') or (EntityTypeQualifierColumn eq 'ContentChannelId' and EntityTypeQualifierValue eq '${channelId}'))&$orderby=Order asc,Id asc`,
          undefined,
          true
        )) as any[];

        attributeColumns = (rawAttrs || [])
          .filter((attr) => attr.Key !== 'DURATION')
          .map((attr) => ({
            id: attr.Id,
            key: attr.Key,
            name: attr.Name,
            fieldTypeId: attr.FieldTypeId,
          }));
      }
    }

    // 3. Process items (updates & additions)
    for (const item of items) {
      let itemId: number;
      const titleToSave = item.attributeValues?.['ACTIVITYTITLE'] || item.title || 'New Segment';

      if (typeof item.id === 'string' || item.isNew) {
        // Create new ContentChannelItem in Rock RMS
        const created = await rockPost('/ContentChannelItems', {
          ContentChannelId: channelId,
          ContentChannelTypeId: 13,
          Title: titleToSave,
          Order: item.order,
          Status: 2, // Approved
          StartDateTime: item.startDateTime || null,
        });

        itemId = typeof created === 'number' ? created : (created?.Id || created?.id || Number(created));
      } else {
        itemId = Number(item.id);
        // Update existing ContentChannelItem
        await rockPatch(`/ContentChannelItems/${itemId}`, {
          Title: titleToSave,
          Order: item.order,
          StartDateTime: item.startDateTime || null,
        });
      }

      if (!itemId || Number.isNaN(itemId) || itemId <= 0) {
        continue;
      }

      // 4. Save dynamic attribute values
      if (attributeColumns && attributeColumns.length > 0) {
        for (const col of attributeColumns) {
          if (!col.id || col.key === 'DURATION') continue;

          let val = item.attributeValues?.[col.key];
          if (val === undefined) {
            if (col.key === 'ACTIVITYTITLE') val = titleToSave;
            else if (col.key === 'DESCRIPTION' || col.key === 'DETIAL') val = item.detail;
            else if (col.key === 'PLATFORM' || col.key === 'ANCHORPREACHER') val = item.anchorPreacher;
            else if (col.key === 'MAININSTRUMENT') val = item.mainInstrument;
            else if (col.key === 'LED WALL' || col.key === 'LEDLIVESCREENS') val = item.ledLiveScreens;
            else if (col.key === 'AUDIO') val = item.audio;
          }

          const valStr = String(val ?? '');
          if (valStr === 'undefined') continue;

          // Check if AttributeValue already exists for this (AttributeId, EntityId)
          const existingValList = (await rockGet(
            `/AttributeValues?$filter=AttributeId eq ${col.id} and EntityId eq ${itemId}`,
            undefined,
            true
          )) as any[];

          if (existingValList && existingValList.length > 0) {
            const valId = existingValList[0].Id;
            await rockPatch(`/AttributeValues/${valId}`, { Value: valStr });
          } else if (valStr) {
            await rockPost('/AttributeValues', {
              AttributeId: col.id,
              EntityId: itemId,
              Value: valStr,
            });
          }
        }
      }

      // Always save DURATION attribute (ID 8432)
      const durationVal = String(item.duration || 0);
      const existingDur = (await rockGet(
        `/AttributeValues?$filter=AttributeId eq 8432 and EntityId eq ${itemId}`,
        undefined,
        true
      )) as any[];
      if (existingDur && existingDur.length > 0) {
        await rockPatch(`/AttributeValues/${existingDur[0].Id}`, { Value: durationVal });
      } else {
        await rockPost('/AttributeValues', { AttributeId: 8432, EntityId: itemId, Value: durationVal });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error bulk-saving runsheet items:', err);
    return { success: false, error: err.message || 'Failed to save changes to Rock' };
  }
}
