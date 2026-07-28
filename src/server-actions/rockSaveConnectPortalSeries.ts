'use server';

import { revalidateTag } from 'next/cache';
import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertHasRole } from '@/auth0-hooks/server/assertHasRole';
import { ROCK_API_URL } from '@/constants.server';
import {
  rockGet,
  rockPost,
  rockPatch,
  rockDelete,
} from '@/server-actions/internal/rockFetch';
import { rockResolveContentChannelTypeId } from '@/server-actions/internal/rockResolveContentChannelTypeId';
import { bustConnectMaterialsCache } from '@/server-actions/internal/connectMaterialsCache';
import {
  normalizeRockAttributeValues,
  rockUpsertEntityAttributeValue,
} from '@/server-actions/internal/rockConnectGroupAttributes';
import { ConnectRole } from '@/types/ConnectRole';
import { string, array, object, optional, literal, union, nullable } from 'zod';

// Type definitions for Rock API responses
interface RockContentChannelItem {
  Id?: number;
  ContentChannelId?: number;
  ContentChannelTypeId?: number;
  Title?: string;
  Status?: number;
  StartDateTime?: string | null;
  ExpireDateTime?: string | null;
  AttributeValues?: Record<string, any>;
}

interface RockCampus {
  Id: number;
  Guid: string;
  Name?: string;
}

interface RockGroup {
  Id: number;
  Guid: string;
  Name?: string;
  GroupTypeId?: number;
  ParentGroupId?: number | null;
}

interface RockAttributeDefinition {
  Id: number;
  Key: string;
}

export interface AdminSeries {
  id: number;
  title: string;
  playlistUrl: string;
  campusGuids: string[];
  filterGroupGuid: string;
  filterToggle: 'Show in filtered group' | 'Hide from filtered group' | '';
  startDateTime: string | null;
  expireDateTime: string | null;
  channelId: number;
}

// Input validation schemas
const createSeriesSchema = object({
  title: string().min(1, 'Title is required'),
  playlistUrl: string().url('Invalid playlist URL'),
  campusGuids: array(string().min(1)).min(1, 'Select at least one campus'),
  filterGroupGuid: optional(string()),
  filterToggle: optional(
    union([
      literal('Show in filtered group'),
      literal('Hide from filtered group'),
      literal(''),
    ]),
  ),
  startDateTime: optional(nullable(string())),
  expireDateTime: optional(nullable(string())),
});

const updateSeriesSchema = object({
  title: optional(string().min(1)),
  playlistUrl: optional(string().url()),
  campusGuids: optional(
    array(string().min(1)).min(1, 'Select at least one campus'),
  ),
  filterGroupGuid: optional(string()),
  filterToggle: optional(
    union([
      literal('Show in filtered group'),
      literal('Hide from filtered group'),
      literal(''),
    ]),
  ),
  startDateTime: optional(nullable(string())),
  expireDateTime: optional(nullable(string())),
});

// Module-level cache for attribute IDs
let cachedAttributeIds: {
  Campus: number;
  PlaylistLink: number;
  FilterGroups: number;
  FilterToggle: number;
} | null = null;

/**
 * Fetch attribute IDs for Connect Portal Series attributes.
 * Resolves by Key and caches module-level.
 */
async function rockGetConnectPortalSeriesAttributeIds(): Promise<{
  Campus: number;
  PlaylistLink: number;
  FilterGroups: number;
  FilterToggle: number;
}> {
  if (cachedAttributeIds) {
    return cachedAttributeIds;
  }

  const typeId = await rockResolveContentChannelTypeId();

  const attributes = (await rockGet('/Attributes', {
    $filter: `EntityTypeId eq 208 and EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${typeId}'`,
    $select: 'Id,Key',
  })) as RockAttributeDefinition[];

  const byKey = new Map(attributes.map((attr) => [attr.Key, attr.Id]));

  const requiredKeys = [
    'Campus',
    'PlaylistLink',
    'FilterGroups',
    'FilterToggle',
  ] as const;
  const missing = requiredKeys.filter((key) => !byKey.has(key));

  if (missing.length) {
    throw new Error(
      `Missing Connect Portal Series attributes: ${missing.join(', ')}. Ensure they are provisioned in Rock for content channel type ${typeId}.`,
    );
  }

  cachedAttributeIds = {
    Campus: byKey.get('Campus')!,
    PlaylistLink: byKey.get('PlaylistLink')!,
    FilterGroups: byKey.get('FilterGroups')!,
    FilterToggle: byKey.get('FilterToggle')!,
  };

  return cachedAttributeIds;
}

/**
 * Fetch the content channel ID for the Connect Portal Series type.
 * Returns the first (and typically only) channel of the resolved type.
 */
async function rockGetConnectPortalChannelId(): Promise<number> {
  const typeId = await rockResolveContentChannelTypeId();

  const channels = (await rockGet('/ContentChannels', {
    $filter: `ContentChannelTypeId eq ${typeId}`,
    $select: 'Id,Name',
    $top: 1,
  })) as Array<{ Id: number; Name?: string }>;

  if (!channels.length) {
    throw new Error(
      `No Content Channel found for type ID ${typeId}. Ensure the channel is provisioned in Rock.`,
    );
  }

  return channels[0].Id;
}

function extractRockCreatedId(created: unknown): number {
  if (typeof created === 'number') {
    return created;
  }

  if (typeof created === 'string') {
    const parsed = Number(created);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (created && typeof created === 'object') {
    const body = created as Record<string, unknown>;
    const rawId = body.Id ?? body.id;

    if (typeof rawId === 'number') {
      return rawId;
    }

    if (typeof rawId === 'string') {
      const parsed = Number(rawId);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  throw new Error('Failed to create ContentChannelItem: no ID returned');
}

async function rockGetContentChannelItemSnapshot(id: number): Promise<{
  core: Pick<
    RockContentChannelItem,
    'Title' | 'StartDateTime' | 'ExpireDateTime'
  >;
  attributes: Map<string, string>;
}> {
  const items = (await rockGet('/ContentChannelItems', {
    $filter: `Id eq ${id}`,
    loadAttributes: 'True',
    $top: 1,
  })) as RockContentChannelItem[];

  const item = items[0];
  if (!item) {
    throw new Error(`ContentChannelItem ${id} was not found`);
  }

  const attrs = normalizeRockAttributeValues(item.AttributeValues);
  const attributes = new Map<string, string>();
  for (const attr of attrs || []) {
    if (typeof attr.AttributeKey === 'string') {
      attributes.set(attr.AttributeKey, attr.Value || '');
    }
  }

  return {
    core: {
      Title: item.Title,
      StartDateTime: item.StartDateTime ?? null,
      ExpireDateTime: item.ExpireDateTime ?? null,
    },
    attributes,
  };
}

/**
 * List all Connect Portal Series with admin data (unfiltered by viewer).
 * Returns all items, campus options, group options for filtering, and edit URL.
 */
export async function rockListConnectPortalSeriesAdmin(): Promise<{
  series: AdminSeries[];
  campusOptions: { id: number; name: string; guid: string }[];
  groupOptions: { id: number; name: string; guid: string; parentGroupId: number | null }[];
  rockChannelEditUrl: string;
  channelId: number;
}> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);

  const typeId = await rockResolveContentChannelTypeId();
  const channelId = await rockGetConnectPortalChannelId();

  // Fetch all items unfiltered
  const items = (await rockGet('/ContentChannelItems', {
    $filter: `ContentChannelTypeId eq ${typeId}`,
    loadAttributes: 'True',
  })) as RockContentChannelItem[];

  // Fetch campuses
  const campuses = (await rockGet('/Campuses', {
    $select: 'Id,Guid,Name',
  })) as RockCampus[];

  const campusOptions = campuses.map((c) => ({
    id: c.Id,
    name: c.Name || '',
    guid: c.Guid,
  }));

  // Fetch group options: Connect Group Sections (24) only (business business decision)
  const sections = (await rockGet('/Groups', {
    $filter: 'GroupTypeId eq 24 and IsActive eq true',
    $select: 'Id,Name,Guid,ParentGroupId',
    $top: 1000,
  })) as RockGroup[];

  const groupOptions = sections
    .map((g) => ({
      id: g.Id,
      name: g.Name || '',
      guid: g.Guid,
      parentGroupId: g.ParentGroupId || null,
    }));

  // Map items to AdminSeries
  const series: AdminSeries[] = items
    .filter((item) => item.Id && item.ContentChannelId)
    .map((item) => {
      const attrs = normalizeRockAttributeValues(item.AttributeValues);
      const attrMap = new Map(
        (attrs || []).map((attr) => [attr.AttributeKey, attr.Value]),
      );

      const campusGuidStr = attrMap.get('Campus') || '';
      const playlistUrl = attrMap.get('PlaylistLink') || '';
      const filterGroupGuid = attrMap.get('FilterGroups') || '';
      const filterToggle = (attrMap.get('FilterToggle') || '') as
        | 'Show in filtered group'
        | 'Hide from filtered group'
        | '';

      const campusGuids = campusGuidStr
        ? campusGuidStr
            .split(',')
            .map((g) => g.trim())
            .filter((g) => g.length > 0)
        : [];

      return {
        id: item.Id!,
        title: item.Title || '',
        playlistUrl,
        campusGuids,
        filterGroupGuid,
        filterToggle,
        startDateTime: item.StartDateTime || null,
        expireDateTime: item.ExpireDateTime || null,
        channelId: item.ContentChannelId!,
      };
    });

  // Derive Rock admin edit URL
  const baseUrl = ROCK_API_URL.replace(/\/api$/, '');
  const rockChannelEditUrl = `${baseUrl}/admin/cms/content-channels/${channelId}`;

  return {
    series,
    campusOptions,
    groupOptions,
    rockChannelEditUrl,
    channelId,
  };
}

/**
 * Create a new Connect Portal Series item.
 * Returns the created item ID.
 */
export async function rockCreateConnectPortalSeries(
  input: unknown,
): Promise<{ id: number }> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);
  const validated = createSeriesSchema.parse(input);

  const typeId = await rockResolveContentChannelTypeId();
  const channelId = await rockGetConnectPortalChannelId();
  const attributeIds = await rockGetConnectPortalSeriesAttributeIds();

  // Create the item
  const created = await rockPost('/ContentChannelItems', {
    ContentChannelId: channelId,
    ContentChannelTypeId: typeId,
    Title: validated.title,
    Status: 2, // Approved
    StartDateTime: validated.startDateTime ?? null,
    ExpireDateTime: validated.expireDateTime ?? null,
  });

  const newItemId = extractRockCreatedId(created);

  try {
    await rockUpsertEntityAttributeValue(
      newItemId,
      attributeIds.Campus,
      validated.campusGuids,
    );
    await rockUpsertEntityAttributeValue(
      newItemId,
      attributeIds.PlaylistLink,
      validated.playlistUrl,
    );
    await rockUpsertEntityAttributeValue(
      newItemId,
      attributeIds.FilterGroups,
      validated.filterGroupGuid || '',
    );
    await rockUpsertEntityAttributeValue(
      newItemId,
      attributeIds.FilterToggle,
      validated.filterToggle || '',
    );
  } catch (error) {
    try {
      await rockDelete(`/ContentChannelItems/${newItemId}`);
    } catch (deleteError) {
      console.error(
        `Failed to clean up incomplete ContentChannelItem ${newItemId}`,
        deleteError,
      );
    }
    throw error;
  }

  // Invalidate caches
  revalidateTag('rock:contentchannelitems');
  revalidateTag('rock:attributevalues');
  // Bust the dedicated Connect Materials cache so the change is reflected on the
  // next load (this cache is intentionally immune to the global Rock-write bust).
  await bustConnectMaterialsCache();

  return { id: newItemId };
}

/**
 * Update an existing Connect Portal Series item.
 */
export async function rockUpdateConnectPortalSeries(
  id: number,
  input: unknown,
): Promise<void> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);
  const validated = updateSeriesSchema.parse(input);

  const attributeIds = await rockGetConnectPortalSeriesAttributeIds();
  const previous = await rockGetContentChannelItemSnapshot(id);

  // Update core fields if provided
  const updateBody: Record<string, any> = {};
  if (validated.title !== undefined) updateBody.Title = validated.title;
  if (validated.startDateTime !== undefined)
    updateBody.StartDateTime = validated.startDateTime;
  if (validated.expireDateTime !== undefined)
    updateBody.ExpireDateTime = validated.expireDateTime;

  try {
    if (Object.keys(updateBody).length > 0) {
      await rockPatch(`/ContentChannelItems/${id}`, updateBody);
    }

    // Always upsert attributes (use '' to clear)
    if (validated.campusGuids !== undefined) {
      await rockUpsertEntityAttributeValue(
        id,
        attributeIds.Campus,
        validated.campusGuids,
      );
    }
    if (validated.playlistUrl !== undefined) {
      await rockUpsertEntityAttributeValue(
        id,
        attributeIds.PlaylistLink,
        validated.playlistUrl,
      );
    }
    if (validated.filterGroupGuid !== undefined) {
      await rockUpsertEntityAttributeValue(
        id,
        attributeIds.FilterGroups,
        validated.filterGroupGuid,
      );
    }
    if (validated.filterToggle !== undefined) {
      await rockUpsertEntityAttributeValue(
        id,
        attributeIds.FilterToggle,
        validated.filterToggle,
      );
    }
  } catch (error) {
    try {
      if (Object.keys(updateBody).length > 0) {
        await rockPatch(`/ContentChannelItems/${id}`, previous.core);
      }
      if (validated.campusGuids !== undefined) {
        await rockUpsertEntityAttributeValue(
          id,
          attributeIds.Campus,
          previous.attributes.get('Campus') || '',
        );
      }
      if (validated.playlistUrl !== undefined) {
        await rockUpsertEntityAttributeValue(
          id,
          attributeIds.PlaylistLink,
          previous.attributes.get('PlaylistLink') || '',
        );
      }
      if (validated.filterGroupGuid !== undefined) {
        await rockUpsertEntityAttributeValue(
          id,
          attributeIds.FilterGroups,
          previous.attributes.get('FilterGroups') || '',
        );
      }
      if (validated.filterToggle !== undefined) {
        await rockUpsertEntityAttributeValue(
          id,
          attributeIds.FilterToggle,
          previous.attributes.get('FilterToggle') || '',
        );
      }
    } catch (rollbackError) {
      console.error(
        `Failed to roll back ContentChannelItem ${id}`,
        rollbackError,
      );
    }
    throw error;
  }

  // Invalidate caches
  revalidateTag('rock:contentchannelitems');
  revalidateTag('rock:attributevalues');
  // Bust the dedicated Connect Materials cache so the change is reflected on the
  // next load (this cache is intentionally immune to the global Rock-write bust).
  await bustConnectMaterialsCache();
}

/**
 * Delete a Connect Portal Series item.
 */
export async function rockDeleteConnectPortalSeries(id: number): Promise<void> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);

  await rockDelete(`/ContentChannelItems/${id}`);

  // Invalidate caches
  revalidateTag('rock:contentchannelitems');
  revalidateTag('rock:attributevalues');
  // Bust the dedicated Connect Materials cache so the change is reflected on the
  // next load (this cache is intentionally immune to the global Rock-write bust).
  await bustConnectMaterialsCache();
}
