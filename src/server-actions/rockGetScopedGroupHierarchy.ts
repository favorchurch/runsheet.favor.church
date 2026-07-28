'use server';

import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { RockPerson } from '@/types/RockPerson';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { RockGroupMember, RockGroupMemberStatus } from '@/types/RockGroupMember';

export interface ScopedHierarchyNode {
  id: number;
  regionalLeaders: RockPerson[];
  clusterHeads: RockPerson[];
  // Nearest Region/Cluster section ids + raw names (e.g. 'Region // Brisbane').
  // Null when the group has no such ancestor. Names stay raw; callers strip the
  // 'Region // ' / 'Cluster // ' prefix for display.
  regionId: number | null;
  regionName: string | null;
  clusterId: number | null;
  clusterName: string | null;
}

export async function rockGetScopedGroupHierarchy(rawGroups: RockGroup[]): Promise<Map<number, ScopedHierarchyNode>> {
  // 1. Collect all initial group IDs and their ParentGroupIds
  const allGroupsMap = new Map<number, RockGroup>();
  const parentIdsToFetch = new Set<number>();

  for (const g of rawGroups) {
    allGroupsMap.set(g.Id, g);
    if (g.ParentGroupId) {
      parentIdsToFetch.add(g.ParentGroupId);
    }
  }

  // 2. Fetch ancestors in loop until no more new parents are found
  while (parentIdsToFetch.size > 0) {
    const idsToFetch = Array.from(parentIdsToFetch);
    parentIdsToFetch.clear();

    const fetchedGroups = await batchODataFilter<RockGroup>(idsToFetch, 'Id', (filter) =>
      rockGet('/Groups', {
        $filter: `${filter} and GroupTypeId eq ${RockGroupType.ConnectGroupSection} and IsActive eq true`,
        $select: 'Id,Name,ParentGroupId,GroupTypeId',
      })
    );

    for (const g of fetchedGroups) {
      if (!allGroupsMap.has(g.Id)) {
        allGroupsMap.set(g.Id, g);
        if (g.ParentGroupId && !allGroupsMap.has(g.ParentGroupId)) {
          parentIdsToFetch.add(g.ParentGroupId);
        }
      }
    }
  }

  // 3. For each connect group in rawGroups, traverse up and find nearest Region and Cluster
  const nearestRegionIds = new Set<number>();
  const nearestClusterIds = new Set<number>();
  
  // map from connectGroupId -> { regionId, clusterId }
  const groupAncestors = new Map<number, { regionId: number | null; clusterId: number | null }>();

  for (const g of rawGroups) {
    let regionId: number | null = null;
    let clusterId: number | null = null;

    let currentId: number | null = g.ParentGroupId || null;
    let depth = 0;
    while (currentId && depth < 10) {
      const parentGroup = allGroupsMap.get(currentId);
      if (!parentGroup) break;

      if (!regionId && parentGroup.Name?.startsWith('Region //')) {
        regionId = parentGroup.Id;
        nearestRegionIds.add(regionId);
      }
      if (!clusterId && parentGroup.Name?.startsWith('Cluster //')) {
        clusterId = parentGroup.Id;
        nearestClusterIds.add(clusterId);
      }

      if (regionId && clusterId) break;

      currentId = parentGroup.ParentGroupId || null;
      depth++;
    }

    groupAncestors.set(g.Id, { regionId, clusterId });
  }

  // 4. Fetch Members for all resolved nearest Regions and Clusters
  const sectionsToFetchMembersFor = [...Array.from(nearestRegionIds), ...Array.from(nearestClusterIds)];
  
  let sectionMembers: RockGroupMember[] = [];
  if (sectionsToFetchMembersFor.length > 0) {
    sectionMembers = await batchODataFilter<RockGroupMember>(sectionsToFetchMembersFor, 'GroupId', (filter) =>
      rockGet('/GroupMembers', {
        // Rock exposes GroupMemberStatus as an Edm.String in OData filters.
        $filter: `${filter} and GroupMemberStatus eq '${RockGroupMemberStatus.Active}'`,
        $expand: 'Person',
      })
    );
  }

  // 5. Group the members by section Id
  const sectionLeaders = new Map<number, RockPerson[]>();
  for (const member of sectionMembers) {
    if (!member.Person) continue;
    let arr = sectionLeaders.get(member.GroupId);
    if (!arr) {
      arr = [];
      sectionLeaders.set(member.GroupId, arr);
    }
    arr.push(member.Person);
  }

  // 6. Build the final map for rawGroups
  const finalMap = new Map<number, ScopedHierarchyNode>();
  for (const g of rawGroups) {
    const ancestors = groupAncestors.get(g.Id);
    if (!ancestors) continue;
    const { regionId, clusterId } = ancestors;
    finalMap.set(g.Id, {
      id: g.Id,
      regionalLeaders: regionId ? sectionLeaders.get(regionId) || [] : [],
      clusterHeads: clusterId ? sectionLeaders.get(clusterId) || [] : [],
      regionId,
      regionName: regionId ? allGroupsMap.get(regionId)?.Name ?? null : null,
      clusterId,
      clusterName: clusterId ? allGroupsMap.get(clusterId)?.Name ?? null : null,
    });
  }

  return finalMap;
}
