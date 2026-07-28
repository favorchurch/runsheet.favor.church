'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockResolveContentChannelTypeId } from '@/server-actions/internal/rockResolveContentChannelTypeId';
import {
  readConnectMaterialsDataset,
  writeConnectMaterialsDataset,
} from '@/server-actions/internal/connectMaterialsCache';
import { normalizeRockAttributeValues } from '@/server-actions/internal/rockConnectGroupAttributes';
import { ConnectPortalSeries } from '@/types/ConnectPortalSeries';
import { array, number, object } from 'zod';

const schema = object({
  connectGroupIds: array(number().int().positive()),
});

interface RockContentChannelItem {
  Id: number;
  IdKey?: string;
  ContentChannelId?: number;
  Title?: string;
  Status?: string;
  StartDateTime?: string | null;
  ExpireDateTime?: string | null;
  Order?: number;
  Priority?: number;
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
  CampusId?: number;
  ParentGroupId?: number | null;
}


function isDateInWindow(
  startDateTime: string | null | undefined,
  expireDateTime: string | null | undefined
): boolean {
  const now = new Date();

  // Rock returns naive datetimes (e.g., "2026-05-24T00:00:00") representing Manila local time.
  // The server runs in UTC. Series windows are day/week-granular, so a few-hours boundary skew
  // is acceptable and no timezone conversion is needed here.

  if (startDateTime) {
    const start = new Date(startDateTime);
    if (now < start) return false;
  }

  if (expireDateTime) {
    const expire = new Date(expireDateTime);
    if (now > expire) return false;
  }

  return true;
}

/**
 * Load the shared, viewer-independent Connect Materials reads (all content channel
 * items with attributes + campuses) through the dedicated multi-day cache.
 *
 * These reads are identical for every viewer and are exactly what Manage Connect
 * Materials edits, so caching them here (immune to the global Rock-write bust, and
 * busted only on save) removes the sequential Rock round-trips on the hot path.
 * The raw data is returned unfiltered — per-viewer visibility and the date-window
 * check run fresh on each request so scheduled series still appear/expire on time.
 */
async function loadConnectMaterialsDataset(): Promise<{
  items: RockContentChannelItem[];
  campuses: RockCampus[];
}> {
  const cached = await readConnectMaterialsDataset();
  if (cached) {
    return {
      items: cached.items as RockContentChannelItem[],
      campuses: cached.campuses as RockCampus[],
    };
  }

  // Resolve the numeric content channel type id
  const contentChannelTypeId = await rockResolveContentChannelTypeId();

  // Fetch all items for this content channel type
  const items = (await rockGet('/ContentChannelItems', {
    $filter: `ContentChannelTypeId eq ${contentChannelTypeId}`,
    $orderby: 'Order,Priority',
    loadAttributes: 'True',
  })) as RockContentChannelItem[];

  // Fetch campuses
  const campuses = (await rockGet('/Campuses', {
    $select: 'Id,Guid,Name',
  })) as RockCampus[];

  await writeConnectMaterialsDataset({ items, campuses });

  return { items, campuses };
}

export async function rockGetConnectPortalSeries({
  connectGroupIds,
}: {
  connectGroupIds: number[];
}): Promise<ConnectPortalSeries[]> {
  await assertAuthenticated();
  schema.parse({ connectGroupIds });

  if (!connectGroupIds.length) {
    return [];
  }

  // Shared, viewer-independent reads served from the dedicated 3-day cache.
  const { items, campuses } = await loadConnectMaterialsDataset();

  // Build campus GUID -> Id map
  const campusGuidToId = new Map<string, number>();
  for (const campus of campuses) {
    campusGuidToId.set(campus.Guid.toLowerCase(), campus.Id);
  }

  // Build viewer group info: cache group + ancestors
  const groupCache = new Map<number, RockGroup>();
  const groupAncestorGuids = new Map<number, Set<string>>();

  async function getGroupWithAncestors(groupId: number): Promise<{
    group: RockGroup | null;
    ancestorGuids: Set<string>;
  }> {
    // If we've already computed the full ancestor set for this groupId, return it
    if (groupAncestorGuids.has(groupId)) {
      const cached = groupCache.get(groupId);
      return {
        group: cached || null,
        ancestorGuids: groupAncestorGuids.get(groupId)!,
      };
    }

    // Fetch the group if not yet cached
    if (!groupCache.has(groupId)) {
      const groups = (await rockGet('/Groups', {
        $filter: `Id eq ${groupId}`,
        $select: 'Id,Guid,CampusId,ParentGroupId',
      })) as RockGroup[];

      if (!groups.length) {
        // Group not found; cache null and return empty ancestor set
        groupAncestorGuids.set(groupId, new Set());
        return { group: null, ancestorGuids: new Set() };
      }

      groupCache.set(groupId, groups[0]);
    }

    const group = groupCache.get(groupId)!;

    // Walk ancestors upward, reusing groupCache for each hop
    const ancestorGuids = new Set<string>();
    ancestorGuids.add(group.Guid.toLowerCase());

    let currentId = group.ParentGroupId;
    const visitedIds = new Set<number>();

    while (currentId && !visitedIds.has(currentId)) {
      visitedIds.add(currentId);

      // Fetch parent group if not in cache
      if (!groupCache.has(currentId)) {
        const parentGroups = (await rockGet('/Groups', {
          $filter: `Id eq ${currentId}`,
          $select: 'Id,Guid,CampusId,ParentGroupId',
        })) as RockGroup[];

        if (!parentGroups.length) break;
        groupCache.set(currentId, parentGroups[0]);
      }

      const parent = groupCache.get(currentId)!;
      ancestorGuids.add(parent.Guid.toLowerCase());
      currentId = parent.ParentGroupId;
    }

    groupAncestorGuids.set(groupId, ancestorGuids);
    return { group, ancestorGuids };
  }

  // Fetch info for all viewer groups
  const viewerGroupsInfo = new Map<number, { campusId?: number; ancestorGuids: Set<string> }>();

  for (const groupId of connectGroupIds) {
    const { group, ancestorGuids } = await getGroupWithAncestors(groupId);
    if (!group) {
      console.warn(`Group ${groupId} not found; treating as having no campus and empty ancestor set`);
    }
    viewerGroupsInfo.set(groupId, {
      campusId: group?.CampusId,
      ancestorGuids,
    });
  }

  // Process items and apply visibility rules
  const allSeries: ConnectPortalSeries[] = [];
  const seenIds = new Set<number>();

  for (const item of items) {
    if (!item.Id || seenIds.has(item.Id)) continue;

    try {
      // Parse attributes
      const attrs = normalizeRockAttributeValues(item.AttributeValues);
      const attrMap = new Map(
        (attrs || []).map((attr) => [attr.AttributeKey, attr.Value])
      );

      const campusGuidStr = attrMap.get('Campus') || '';
      const playlistLink = attrMap.get('PlaylistLink') || '';
      const filterGroupGuidStr = attrMap.get('FilterGroups') || '';
      const filterToggleStr = attrMap.get('FilterToggle') || '';

      // Skip items with no playlist link
      if (!playlistLink) {
        console.warn(`ContentChannelItem ${item.Id} has no PlaylistLink; skipping`);
        continue;
      }

      // Parse campus GUIDs (comma-delimited)
      const campusGuids = campusGuidStr
        ? campusGuidStr.split(',').map((g) => g.trim().toLowerCase())
        : [];
      const campusIds = campusGuids
        .map((guid) => campusGuidToId.get(guid))
        .filter((id): id is number => id !== undefined);

      // Parse filter group GUID (single value or blank)
      const filterGroupGuid = filterGroupGuidStr ? filterGroupGuidStr.toLowerCase() : undefined;

      // Parse filter toggle
      let filterToggle: 'show' | 'hide' | 'none' = 'none';
      if (filterToggleStr === 'Show in filtered group') {
        filterToggle = 'show';
      } else if (filterToggleStr === 'Hide from filtered group') {
        filterToggle = 'hide';
      }

      // Check visibility for at least one viewer group
      let isVisible = false;

      for (const [, viewerInfo] of viewerGroupsInfo) {
        const viewerCampusId = viewerInfo.campusId;

        // 1. Campus match
        if (!viewerCampusId || !campusIds.includes(viewerCampusId)) {
          continue;
        }

        // 2. Active date window
        if (!isDateInWindow(item.StartDateTime, item.ExpireDateTime)) {
          continue;
        }

        // 3. Filter group test
        if (!filterGroupGuid) {
          // No filter group set: show to all groups in campus
          isVisible = true;
          break;
        } else {
          // Filter group is set
          const isDescendantOrSelf = viewerInfo.ancestorGuids.has(filterGroupGuid);

          if (filterToggle === 'show' || filterToggle === 'none') {
            // Show if viewer is descendant or filter group itself
            if (isDescendantOrSelf) {
              isVisible = true;
              break;
            }
          } else if (filterToggle === 'hide') {
            // Show if viewer is NOT descendant and NOT filter group itself
            if (!isDescendantOrSelf) {
              isVisible = true;
              break;
            }
          }
        }
      }

      if (!isVisible) continue;

      seenIds.add(item.Id);
      allSeries.push({
        id: item.Id,
        idKey: item.IdKey,
        channelId: item.ContentChannelId,
        title: item.Title || '',
        displayTitle: item.Title || '',
        playlistUrl: playlistLink,
        startDateTime: item.StartDateTime,
        expireDateTime: item.ExpireDateTime,
        campusIds,
        filterGroupGuid,
        filterToggle,
      });
    } catch (e) {
      console.error(`Failed to parse ConnectPortalSeries item ${item.Id}`, e);
    }
  }

  return allSeries;
}
