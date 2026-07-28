'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { ROCK_CACHE_TTL_SECONDS } from '@/constants.server';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup, RockGroupType } from '@/types/RockGroup';
import { ConnectRole } from '@/types/ConnectRole';
import { RockPerson } from '@/types/RockPerson';
import { rockGetConnectRoleFromGroupRoleId } from '@/util-rock/utilGetConnectRoleFromGroupRoleId';
import { RockGroupMemberStatus } from '@/types/RockGroupMember';

export interface GroupHierarchyNode {
  id: number;
  name: string;
  parentGroupId: number | null;
  typeId: number;
  regionalLeaders: RockPerson[];
  clusterHeads: RockPerson[];
}

let hierarchyCache: Map<number, GroupHierarchyNode> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = Math.max(ROCK_CACHE_TTL_SECONDS, 0) * 1000;

function inferLeaderRole(group: RockGroup): ConnectRole | null {
  if (group.GroupTypeId !== RockGroupType.ConnectGroupSection) return null;
  if (group.Name?.startsWith('Region //')) return ConnectRole.RegionalLeader;
  if (group.Name?.startsWith('Cluster //')) return ConnectRole.ClusterHead;
  return null;
}

export async function rockClearGroupHierarchyCache() {
  hierarchyCache = null;
  lastFetchTime = 0;
}

export async function rockGetGroupHierarchy(): Promise<Map<number, GroupHierarchyNode>> {
  await assertAuthenticated();

  const now = Date.now();
  if (hierarchyCache && now - lastFetchTime < CACHE_TTL) {
    return hierarchyCache;
  }

  // Fetch all sections (Type 24) and connect groups (Type 25)
  const [sections, connectGroups]: [RockGroup[], RockGroup[]] = await Promise.all([
    rockGet('/Groups', {
      $filter: `GroupTypeId eq ${RockGroupType.ConnectGroupSection} and IsActive eq true`,
      $expand: 'Members,Members/Person',
      $select: 'Id,Name,ParentGroupId,GroupTypeId',
      $top: 1000,
    }),
    rockGet('/Groups', {
      $filter: `GroupTypeId eq ${RockGroupType.ConnectGroup} and IsActive eq true`,
      $select: 'Id,Name,ParentGroupId,GroupTypeId',
      $top: 10000,
    }),
  ]);

  const allGroups = [...sections, ...connectGroups];
  const nodeMap = new Map<number, GroupHierarchyNode>();

  // Map for quick access by ID
  const allGroupsMap = new Map(allGroups.map(g => [g.Id, g]));

  // First pass: create nodes and identify leaders in sections
  for (const group of allGroups) {
    const regionalLeaders: RockPerson[] = [];
    const clusterHeads: RockPerson[] = [];

    if (group.Members) {
      for (const member of group.Members) {
        if (member.GroupMemberStatus !== RockGroupMemberStatus.Active || !member.Person) continue;
        const role = rockGetConnectRoleFromGroupRoleId(member.GroupRoleId);
        if (role === ConnectRole.RegionalLeader) {
          regionalLeaders.push(member.Person);
        } else if (role === ConnectRole.ClusterHead) {
          clusterHeads.push(member.Person);
        }
      }
    }

    nodeMap.set(group.Id, {
      id: group.Id,
      name: group.Name || '',
      parentGroupId: group.ParentGroupId || null,
      typeId: group.GroupTypeId || 0,
      regionalLeaders,
      clusterHeads,
    });
  }

  // Second pass: propagate leaders ancestors for each group.
  const finalMap = new Map<number, GroupHierarchyNode>();

  for (const group of allGroups) {
    const regionalLeaders = new Map<number, RockPerson>();
    const clusterHeads = new Map<number, RockPerson>();

    let currentId: number | null = group.Id;
    let depth = 0;
    while (currentId && depth < 10) {
      const currentGroup = allGroupsMap.get(currentId);
      if (!currentGroup) break;

      const role = inferLeaderRole(currentGroup);
      const node = nodeMap.get(currentId);
      
      if (node) {
        node.regionalLeaders.forEach(p => regionalLeaders.set(p.Id, p));
        node.clusterHeads.forEach(p => clusterHeads.set(p.Id, p));
        
        // If it's a Region group, all its members are potentially regional leaders
        // if they don't have explicit roles.
        if (role === ConnectRole.RegionalLeader || role === ConnectRole.ClusterHead) {
            if (currentGroup.Members) {
                for (const m of currentGroup.Members) {
                    if (m.GroupMemberStatus === RockGroupMemberStatus.Active && m.Person) {
                        if (role === ConnectRole.RegionalLeader) regionalLeaders.set(m.Person.Id, m.Person);
                        if (role === ConnectRole.ClusterHead) clusterHeads.set(m.Person.Id, m.Person);
                    }
                }
            }
        }
      }

      currentId = currentGroup.ParentGroupId || null;
      depth++;
    }

    finalMap.set(group.Id, {
      ...nodeMap.get(group.Id)!,
      regionalLeaders: Array.from(regionalLeaders.values()),
      clusterHeads: Array.from(clusterHeads.values()),
    });
  }

  hierarchyCache = finalMap;
  lastFetchTime = now;
  return finalMap;
}
