'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { isPersonColumn } from '@/constants/runsheetColumns';

/** Rock's `ContentChannelItem` entity type, used to find item attributes. */
const CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID = 208;

/** Resolved person names, memoised per server instance. */
const personNameCache = new Map<string, string>();

function looksLikePersonKey(value: string): boolean {
  return /^\d+$/.test(value) || /^[0-9a-fA-F-]{32,36}$/.test(value);
}

/**
 * Turns a Person attribute's stored value into a display name.
 *
 * Rock stores Person attributes as a PersonAlias GUID (or occasionally a bare
 * person id), so a raw read shows an opaque key. Rock usually keeps the rendered
 * name alongside it in `AttributeValue.PersistedTextValue`, which is checked
 * first; otherwise the person record is fetched directly.
 */
async function resolvePersonName(rawValue: string): Promise<string> {
  const trimmed = rawValue?.trim() ?? '';
  if (!trimmed || trimmed === 'undefined') return '';

  const cached = personNameCache.get(trimmed);
  if (cached) return cached;

  // Already a name rather than an id/GUID.
  if (!looksLikePersonKey(trimmed)) return trimmed;

  try {
    const matches = (await rockGet('/AttributeValues', {
      $filter: `Value eq '${trimmed.replace(/'/g, "''")}'`,
      $top: 1,
      $select: 'PersistedTextValue,ValueAsPersonId',
    })) as any[];

    const match = Array.isArray(matches) ? matches[0] : undefined;

    if (match?.PersistedTextValue) {
      personNameCache.set(trimmed, match.PersistedTextValue);
      return match.PersistedTextValue;
    }

    const personId = match?.ValueAsPersonId ?? (/^\d+$/.test(trimmed) ? trimmed : null);
    if (personId) {
      const person = (await rockGet(`/People/${personId}`, { $select: 'FirstName,LastName' })) as
        | { FirstName?: string; LastName?: string }
        | null;

      if (person?.FirstName) {
        const fullName = `${person.FirstName} ${person.LastName || ''}`.trim();
        personNameCache.set(trimmed, fullName);
        return fullName;
      }
    }
  } catch (err) {
    console.error('Error resolving person name for key:', trimmed, err);
  }

  return rawValue;
}

/** Loads a runsheet channel, its dynamic columns, and every segment row. */
export async function rockGetRunsheetDetails(channelId: number) {
  try {
    await getRockSession();

    const channel = (await rockGet(`/ContentChannels/${channelId}`)) as {
      Id: number;
      Name: string;
      ContentChannelTypeId: number;
    } | null;

    if (!channel) {
      throw new Error(`Content Channel ${channelId} not found`);
    }

    const typeId = channel.ContentChannelTypeId;

    // Item attributes can be attached to the channel type or to this channel.
    const rawAttrs = (await rockGet(
      '/Attributes',
      {
        $filter:
          `EntityTypeId eq ${CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID} and ` +
          `((EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${typeId}') or ` +
          `(EntityTypeQualifierColumn eq 'ContentChannelId' and EntityTypeQualifierValue eq '${channelId}'))`,
        $orderby: 'Order asc,Id asc',
      },
      true,
    )) as any[];

    // DURATION drives the dedicated Start/End/Duration columns, not a text cell.
    const columns: DynamicAttributeColumn[] = (rawAttrs || [])
      .filter((attr) => attr.Key !== 'DURATION')
      .map((attr) => ({
        id: attr.Id,
        key: attr.Key,
        name: attr.Name,
        fieldTypeId: attr.FieldTypeId,
      }));

    const rawItems = (await rockGet(
      '/ContentChannelItems',
      {
        $filter: `ContentChannelId eq ${channelId}`,
        $orderby: 'Order asc',
        loadAttributes: 'simple',
      },
      true,
    )) as any[];

    const items: RunsheetItemRow[] = await Promise.all(
      (rawItems || []).map(async (item) => {
        const attrs = item.AttributeValues || {};
        const getAttrVal = (key: string) => attrs[key]?.Value || '';

        const durationNum = parseInt(getAttrVal('DURATION'), 10);
        const attributeValues: Record<string, string> = {};

        for (const col of columns) {
          const attrObj = attrs[col.key];
          let rawVal: string = attrObj?.PersistedTextValue || attrObj?.ValueFormatted || attrObj?.Value || '';

          if (rawVal && isPersonColumn(col) && looksLikePersonKey(rawVal.trim())) {
            rawVal = await resolvePersonName(rawVal);
          }

          attributeValues[col.key] = rawVal;
        }

        // The activity title attribute is the source of truth; Rock's own Title
        // column is the plain-text mirror kept for Rock's admin screens.
        const titleVal = attributeValues.ACTIVITYTITLE || item.Title || '';
        attributeValues.ACTIVITYTITLE = titleVal;

        return {
          id: item.Id,
          title: titleVal,
          order: item.Order || 0,
          startDateTime: item.StartDateTime || '',
          duration: Number.isNaN(durationNum) ? 0 : durationNum,
          attributeValues,
          detail: attributeValues.DESCRIPTION || attributeValues.DETIAL || getAttrVal('DETIAL') || '',
          anchorPreacher: attributeValues.PLATFORM || attributeValues.ANCHORPREACHER || getAttrVal('ANCHORPREACHER') || '',
          mainInstrument: attributeValues.MAININSTRUMENT || getAttrVal('MAININSTRUMENT') || '',
          ledLiveScreens:
            attributeValues['LED WALL'] || attributeValues.LEDLIVESCREENS || getAttrVal('LEDLIVESCREENS') || '',
          overlayBroadcast: attributeValues.OVERLAYBROADCAST || getAttrVal('OVERLAYBROADCAST') || '',
          lighting: attributeValues.LIGHTING || getAttrVal('LIGHTING') || '',
          audio: attributeValues.AUDIO || getAttrVal('AUDIO') || '',
        };
      }),
    );

    return {
      success: true,
      data: {
        channelId: channel.Id,
        name: channel.Name,
        contentChannelTypeId: typeId,
        columns,
        items,
      },
    };
  } catch (err: any) {
    console.error('Error fetching runsheet details:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch runsheet details',
    };
  }
}
