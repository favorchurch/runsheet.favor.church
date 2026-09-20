'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import type { DynamicAttributeColumn, RunsheetItemRow, RunsheetColumnMetadata } from '@/types/Runsheet';
import { isPersonColumn, HIDDEN_ATTRIBUTE_KEYS } from '@/constants/runsheetColumns';
import { canAccessRunsheetChannel } from '@/lib/runsheetCampus';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

/** Rock's `ContentChannelItem` entity type, used to find item attributes. */
const CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID = 208;
const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

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
/**
 * Resolves every person-column cell's stored key to a display name in at most
 * two Rock API calls total, regardless of how many rows/cells need it.
 *
 * Resolving one cell at a time (one `/AttributeValues` + one `/People` round
 * trip per cell) was the actual cause of multi-minute runsheet loads: on a
 * serverless deploy each request gets a fresh function instance, so
 * `personNameCache` starts empty every time and every person cell paid for a
 * live, sequential Rock round trip on every single page view/refresh.
 */
async function resolvePersonNamesBatch(rawValues: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toResolve = new Set<string>();

  for (const rawValue of rawValues) {
    const trimmed = rawValue?.trim() ?? '';
    if (!trimmed || trimmed === 'undefined') continue;

    const cached = personNameCache.get(trimmed);
    if (cached) {
      result.set(trimmed, cached);
      continue;
    }

    // Already a name rather than an id/GUID.
    if (!looksLikePersonKey(trimmed)) {
      result.set(trimmed, trimmed);
      continue;
    }

    toResolve.add(trimmed);
  }

  if (toResolve.size === 0) return result;

  const keys = Array.from(toResolve);
  const BATCH_SIZE = 15; // Keep OData $filter string under IIS 2048-byte URL limit

  // 1. Chunk keys into batches of 15 and fetch AttributeValues in parallel
  const keyBatches: string[][] = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    keyBatches.push(keys.slice(i, i + BATCH_SIZE));
  }

  const byValue = new Map<string, any>();

  await Promise.all(
    keyBatches.map(async (batchKeys) => {
      try {
        const filter = batchKeys.map((key) => `Value eq '${key.replace(/'/g, "''")}'`).join(' or ');
        const matches = (await rockGet('/AttributeValues', {
          $filter: filter,
          $top: batchKeys.length,
          $select: 'Value,PersistedTextValue,ValueAsPersonId',
        })) as any[];

        for (const match of matches || []) {
          if (match?.Value) {
            byValue.set(match.Value, match);
          }
        }
      } catch (err) {
        console.error('Error fetching AttributeValues chunk:', err);
      }
    })
  );

  const idToKeys = new Map<string, string[]>();

  for (const key of keys) {
    const match = byValue.get(key);
    if (match?.PersistedTextValue) {
      personNameCache.set(key, match.PersistedTextValue);
      result.set(key, match.PersistedTextValue);
      continue;
    }

    const personId = match?.ValueAsPersonId ?? (/^\d+$/.test(key) ? key : null);
    if (personId) {
      const idKey = String(personId);
      idToKeys.set(idKey, [...(idToKeys.get(idKey) || []), key]);
    }
  }

  // 2. Chunk person IDs into batches of 15 and fetch People in parallel
  if (idToKeys.size > 0) {
    const personIds = Array.from(idToKeys.keys());
    const idBatches: string[][] = [];
    for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
      idBatches.push(personIds.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(
      idBatches.map(async (batchIds) => {
        try {
          const idFilter = batchIds.map((id) => `Id eq ${id}`).join(' or ');
          const people = (await rockGet('/People', {
            $filter: idFilter,
            $select: 'Id,FirstName,LastName',
            $top: batchIds.length,
          })) as any[];

          for (const person of people || []) {
            if (!person?.FirstName) continue;
            const fullName = `${person.FirstName} ${person.LastName || ''}`.trim();
            for (const key of idToKeys.get(String(person.Id)) || []) {
              personNameCache.set(key, fullName);
              result.set(key, fullName);
            }
          }
        } catch (err) {
          console.error('Error fetching People chunk:', err);
        }
      })
    );
  }

  // Anything still unresolved (lookup failed, orphaned reference) just
  // falls back to showing its raw stored key instead of blowing up the load.
  for (const key of keys) {
    if (!result.has(key)) result.set(key, key);
  }

  return result;
}

/** Loads a runsheet channel, its dynamic columns, and every segment row. */
export async function rockGetRunsheetDetails(channelId: number) {
  try {
    if (!Number.isSafeInteger(channelId) || channelId <= 0) {
      return { success: false, error: 'Invalid runsheet.' };
    }

    const session = await getRockSession();
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const channel = (await rockGet(`/ContentChannels/${channelId}`)) as {
      Id: number;
      Name: string;
      Description?: string;
      ForeignKey?: string;
      ChannelUrl?: string;
      ContentChannelTypeId: number;
    } | null;

    if (!channel) {
      return { success: false, error: 'Runsheet not found.' };
    }

    if (channel.ContentChannelTypeId !== RUNSHEET_CONTENT_CHANNEL_TYPE_ID) {
      return { success: false, error: 'Runsheet not found.' };
    }

    // Defense in depth: the channel list already scopes by campus, but this
    // blocks a direct/shared link to a channel outside the user's campus too.
    if (!canAccessRunsheetChannel(session.access?.runsheetCampuses, channel.Name)) {
      return { success: false, error: 'You do not have access to this runsheet.' };
    }

    let columnMetadata: RunsheetColumnMetadata | undefined = undefined;
    if (channel.ChannelUrl) {
      try {
        const parsed = typeof channel.ChannelUrl === 'string' ? JSON.parse(channel.ChannelUrl) : channel.ChannelUrl;
        if (parsed && typeof parsed === 'object') {
          columnMetadata = {
            order: Array.isArray(parsed.order) ? parsed.order : undefined,
            widths: parsed.widths && typeof parsed.widths === 'object' ? parsed.widths : undefined,
          };
        }
      } catch (err) {
        console.warn('Failed to parse ChannelUrl as columnMetadata JSON:', err);
      }
    }

    const typeId = channel.ContentChannelTypeId;

    // Item attributes can be attached to the channel type or to this channel.
    const rawAttrsPromise = rockGet(
      '/Attributes',
      {
        $filter:
          `EntityTypeId eq ${CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID} and ` +
          `((EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${typeId}') or ` +
          `(EntityTypeQualifierColumn eq 'ContentChannelId' and EntityTypeQualifierValue eq '${channelId}'))`,
        $orderby: 'Order asc,Id asc',
      },
    );

    const rawItemsPromise = rockGet('/ContentChannelItems', {
      $filter: `ContentChannelId eq ${channelId}`,
      $orderby: 'Order asc',
      loadAttributes: 'simple',
    });

    const [resolvedAttrs, resolvedItems] = await Promise.all([rawAttrsPromise, rawItemsPromise]);
    const rawAttrs = resolvedAttrs as any[];

    // DURATION drives the dedicated Start/End/Duration columns, SONGITEMID
    // is an internal reference to the linked Song, and SIBLINGKEY is the shared row key.
    const columns: DynamicAttributeColumn[] = (rawAttrs || [])
      .filter((attr) => !HIDDEN_ATTRIBUTE_KEYS.includes(attr.Key))
      .map((attr) => ({
        id: attr.Id,
        key: attr.Key,
        name: attr.Name,
        fieldTypeId: attr.FieldTypeId,
        width: columnMetadata?.widths?.[attr.Key],
      }));

    if (columnMetadata?.order && columnMetadata.order.length > 0) {
      const orderMap = new Map<string, number>();
      columnMetadata.order.forEach((key, idx) => {
        orderMap.set(key, idx);
      });
      columns.sort((a, b) => {
        const orderA = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
        const orderB = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      });
    }

    const rawItems = resolvedItems as any[];

    // Collect every person-column cell's raw value up front so all of them can
    // be resolved to display names in one or two batched Rock calls, instead
    // of one live round trip per cell (see resolvePersonNamesBatch above).
    const personKeysToResolve: string[] = [];
    for (const item of rawItems || []) {
      const attrs = item.AttributeValues || {};
      for (const col of columns) {
        if (!isPersonColumn(col)) continue;
        const attrObj = attrs[col.key];
        const rawVal: string = attrObj?.PersistedTextValue || attrObj?.Value || attrObj?.ValueFormatted || '';
        if (rawVal && looksLikePersonKey(rawVal.trim())) {
          personKeysToResolve.push(rawVal.trim());
        }
      }
    }
    const resolvedPersonNames = await resolvePersonNamesBatch(personKeysToResolve);

    const items: RunsheetItemRow[] = (rawItems || []).map((item) => {
        const attrs = item.AttributeValues || {};
        const getAttrVal = (key: string) => attrs[key]?.Value || '';

        const durationNum = parseFloat(getAttrVal('DURATION'));

        const attributeValues: Record<string, string> = {};

        for (const col of columns) {
          const attrObj = attrs[col.key];
          // `Value` is the raw stored value. `ValueFormatted` is Rock's own
          // rendering for admin-screen display — for MarkdownFieldType it
          // HTML-encodes the raw value first (our cells already store real
          // HTML), so preferring it here double-escapes entities like `&`
          // into `&amp;amp;`, which then only half-decodes back to `&amp;`
          // once rendered. `Value` is what the runsheet editor itself wrote.
          let rawVal: string = attrObj?.PersistedTextValue || attrObj?.Value || attrObj?.ValueFormatted || '';

          if (rawVal && isPersonColumn(col) && looksLikePersonKey(rawVal.trim())) {
            rawVal = resolvedPersonNames.get(rawVal.trim()) || rawVal;
          }

          attributeValues[col.key] = rawVal;
        }

        // The activity title attribute is the source of truth; Rock's own Title
        // column is the plain-text mirror kept for Rock's admin screens.
        const titleVal = attributeValues.ACTIVITYTITLE || item.Title || '';
        attributeValues.ACTIVITYTITLE = titleVal;

        const songItemIdNum = parseInt(getAttrVal('SONGITEMID'), 10);

        return {
          id: item.Id,
          title: titleVal,
          order: item.Order || 0,
          startDateTime: item.StartDateTime || '',
          duration: Number.isNaN(durationNum) ? 0 : durationNum,
          attributeValues,
          songItemId: Number.isNaN(songItemIdNum) ? null : songItemIdNum,
          detail: attributeValues.DESCRIPTION || attributeValues.DETIAL || getAttrVal('DETIAL') || '',
          anchorPreacher: attributeValues.PLATFORM || attributeValues.ANCHORPREACHER || getAttrVal('ANCHORPREACHER') || '',
          mainInstrument: attributeValues.MAININSTRUMENT || getAttrVal('MAININSTRUMENT') || '',
          ledLiveScreens:
            attributeValues['LED WALL'] || attributeValues.LEDLIVESCREENS || getAttrVal('LEDLIVESCREENS') || '',
          overlayBroadcast: attributeValues.OVERLAYBROADCAST || getAttrVal('OVERLAYBROADCAST') || '',
          lighting: attributeValues.LIGHTING || getAttrVal('LIGHTING') || '',
          audio: attributeValues.AUDIO || getAttrVal('AUDIO') || '',
        };
      });

    return {
      success: true,
      data: {
        channelId: channel.Id,
        name: channel.Name,
        subtitle: channel.Description || '',
        // Stored independently of Name/Description so editing Start Time never
        // touches the runsheet's title — Rock's `ForeignKey` is a free-text
        // field reserved for exactly this kind of external app bookkeeping.
        startTime: channel.ForeignKey || '',
        columnMetadata,
        contentChannelTypeId: typeId,
        columns,
        items,
      },
    };
  } catch (err: any) {
    console.error('Error fetching runsheet details:', err);
    return {
      success: false,
      error: 'Failed to fetch runsheet details',
    };
  }
}
