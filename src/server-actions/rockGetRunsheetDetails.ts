'use server';

import { rockGet } from '@/server-actions/internal/rockFetch';

export interface DynamicAttributeColumn {
  id: number;
  key: string;
  name: string;
  fieldTypeId?: number;
}

export interface RunsheetItemRow {
  id: number | string; // number if existing in Rock, string (temp id) if newly added locally
  isNew?: boolean;
  isDeleted?: boolean;
  isDirty?: boolean;
  title: string;
  order: number;
  startDateTime?: string;
  duration: number; // in minutes
  attributeValues: Record<string, string>; // Dynamic attribute key -> value
  detail?: string;
  anchorPreacher?: string;
  mainInstrument?: string;
  ledLiveScreens?: string;
  overlayBroadcast?: string;
  lighting?: string;
  audio?: string;
}

export interface RunsheetDetails {
  channelId: number;
  name: string;
  contentChannelTypeId: number;
  columns: DynamicAttributeColumn[];
  items: RunsheetItemRow[];
}

const personNameCache: { [key: string]: string } = {};

async function resolvePersonName(key: string, rockUrl: string, rockKey: string): Promise<string> {
  if (!key || key === 'undefined' || !key.trim()) return '';
  const trimmed = key.trim();
  if (trimmed === 'undefined') return '';

  // If already in-memory cached
  if (personNameCache[trimmed]) {
    return personNameCache[trimmed];
  }

  // If it's already a full name (has spaces/letters, not a pure numeric ID or GUID)
  if (!/^\d+$/.test(trimmed) && !/^[0-9a-fA-F-]{32,36}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    // 1. Check Rock AttributeValues table directly (Rock stores PersistedTextValue like "Ijah Callao" for Person alias GUIDs!)
    const attrRes = await fetch(
      `${rockUrl}/AttributeValues?$filter=Value eq '${trimmed}'&$top=1&$select=PersistedTextValue,ValueAsPersonId`,
      {
        headers: {
          'Authorization-Token': rockKey,
          'Accept': 'application/json',
        },
        cache: 'force-cache',
      }
    );
    if (attrRes.ok) {
      const attrData = await attrRes.json();
      if (Array.isArray(attrData) && attrData.length > 0) {
        const item = attrData[0];
        if (item.PersistedTextValue) {
          personNameCache[trimmed] = item.PersistedTextValue;
          return item.PersistedTextValue;
        }
        if (item.ValueAsPersonId) {
          const pRes = await fetch(`${rockUrl}/People/${item.ValueAsPersonId}?$select=FirstName,LastName`, {
            headers: {
              'Authorization-Token': rockKey,
              'Accept': 'application/json',
            },
            cache: 'force-cache',
          });
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData?.FirstName) {
              const fullName = `${pData.FirstName} ${pData.LastName || ''}`.trim();
              personNameCache[trimmed] = fullName;
              return fullName;
            }
          }
        }
      }
    }

    // 2. Try GET /People/{id} if numeric ID
    if (/^\d+$/.test(trimmed)) {
      const res = await fetch(`${rockUrl}/People/${trimmed}?$select=FirstName,LastName`, {
        headers: {
          'Authorization-Token': rockKey,
          'Accept': 'application/json',
        },
        cache: 'force-cache',
      });
      if (res.ok) {
        const p = await res.json();
        if (p && p.FirstName) {
          const fullName = `${p.FirstName} ${p.LastName || ''}`.trim();
          personNameCache[trimmed] = fullName;
          return fullName;
        }
      }
    }
  } catch (err) {
    console.error('Error resolving person name for key:', key, err);
  }

  return key;
}

export async function rockGetRunsheetDetails(channelId: number) {
  try {
    const rockUrl = process.env.ROCK_API_URL || 'https://rock.favor.church/api';
    const rockKey = process.env.ROCK_API_KEY || 'IULFJIYTsYHPd8x28Jwi0H21';

    // 1. Fetch Content Channel info
    const channel = (await rockGet(`/ContentChannels/${channelId}`)) as { Id: number; Name: string; ContentChannelTypeId: number };
    if (!channel) {
      throw new Error(`Content Channel ${channelId} not found`);
    }

    const typeId = channel.ContentChannelTypeId;

    // 2. Fetch Dynamic Item Attributes from Rock RMS for ContentChannelType & ContentChannel
    const rawAttrs = (await rockGet(
      `/Attributes?$filter=EntityTypeId eq 208 and ((EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${typeId}') or (EntityTypeQualifierColumn eq 'ContentChannelId' and EntityTypeQualifierValue eq '${channelId}'))&$orderby=Order asc,Id asc`,
      undefined,
      true
    )) as any[];

    // Exclude DURATION attribute from general column list since DURATION has dedicated time columns
    const columns: DynamicAttributeColumn[] = (rawAttrs || [])
      .filter((attr) => attr.Key !== 'DURATION')
      .map((attr) => ({
        id: attr.Id,
        key: attr.Key,
        name: attr.Name,
        fieldTypeId: attr.FieldTypeId,
      }));

    // 3. Fetch Content Channel Items for this channel with loaded attributes
    const rawItems = (await rockGet(
      `/ContentChannelItems?$filter=ContentChannelId eq ${channelId}&$orderby=Order asc&loadAttributes=simple`,
      undefined,
      true
    )) as any[];

    // 4. Map items and resolve person GUIDs / values asynchronously
    const items: RunsheetItemRow[] = await Promise.all(
      (rawItems || []).map(async (item) => {
        const attrs = item.AttributeValues || {};
        const getAttrObj = (key: string) => attrs[key];
        const getAttrVal = (key: string) => attrs[key]?.Value || '';

        const durationStr = getAttrVal('DURATION');
        const durationNum = parseInt(durationStr, 10);

        const attributeValues: Record<string, string> = {};

        for (const col of columns) {
          const attrObj = getAttrObj(col.key);
          let rawVal = attrObj?.PersistedTextValue || attrObj?.ValueFormatted || attrObj?.Value || '';

          // If Person field type (18) or Person-related key, resolve PersonAlias GUID to full name!
          if (
            rawVal &&
            (col.fieldTypeId === 18 ||
              col.key.toUpperCase().includes('PLATFORM') ||
              col.key.toUpperCase().includes('ANCHOR') ||
              col.key.toUpperCase().includes('PREACHER'))
          ) {
            if (/^\d+$/.test(rawVal.trim()) || /^[0-9a-fA-F-]{32,36}$/.test(rawVal.trim())) {
              rawVal = await resolvePersonName(rawVal, rockUrl, rockKey);
            }
          }

          attributeValues[col.key] = rawVal;
        }

        // Title preference: use ACTIVITYTITLE if present, fallback to item.Title
        const titleVal = attributeValues['ACTIVITYTITLE'] || item.Title || '';
        attributeValues['ACTIVITYTITLE'] = titleVal;

        // Alias fallbacks for backward compatibility
        const detailVal = attributeValues['DESCRIPTION'] || attributeValues['DETIAL'] || getAttrVal('DETIAL') || '';
        const anchorVal = attributeValues['PLATFORM'] || attributeValues['ANCHORPREACHER'] || getAttrVal('ANCHORPREACHER') || '';

        return {
          id: item.Id,
          title: titleVal,
          order: item.Order || 0,
          startDateTime: item.StartDateTime || '',
          duration: isNaN(durationNum) ? 0 : durationNum,
          attributeValues,
          detail: detailVal,
          anchorPreacher: anchorVal,
          mainInstrument: attributeValues['MAININSTRUMENT'] || getAttrVal('MAININSTRUMENT') || '',
          ledLiveScreens: attributeValues['LED WALL'] || attributeValues['LEDLIVESCREENS'] || getAttrVal('LEDLIVESCREENS') || '',
          overlayBroadcast: attributeValues['OVERLAYBROADCAST'] || getAttrVal('OVERLAYBROADCAST') || '',
          lighting: attributeValues['LIGHTING'] || getAttrVal('LIGHTING') || '',
          audio: attributeValues['AUDIO'] || getAttrVal('AUDIO') || '',
        };
      })
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
