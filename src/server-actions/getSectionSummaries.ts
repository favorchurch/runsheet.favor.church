'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { getAuthAccessibleClusterSections } from '@/auth0-hooks/server/getAuthAccessibleClusterSections';
import { getAuthAccessibleRegionalSections } from '@/auth0-hooks/server/getAuthAccessibleRegionalSections';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroupType } from '@/types/RockGroup';
import { rockGetMultipleConnectEventsDateFilter } from '@/server-actions/rockGetMultipleConnectEventsDateFilter';
import { getConnectWeekRangeParams } from '@/util-date/getConnectWeekRange';
import { rockGetFoldedSectionIds } from '@/server-actions/rockGetFoldedSectionIds';

export interface SectionSummary {
  sectionId: number;
  submittedCount: number;
  totalCount: number;
}

export async function getSectionSummaries(
  sectionIds: number[],
  beforeDate?: string,
  afterDate?: string
): Promise<SectionSummary[]> {
  await assertAuthenticated();
  if (sectionIds.length === 0) return [];

  // Security check: Only fetch summaries for sections the user actually has access to
  const [clusterSections, regionalSections] = await Promise.all([
    getAuthAccessibleClusterSections().catch(() => []),
    getAuthAccessibleRegionalSections().catch(() => []),
  ]);
  const allowedIds = new Set([
    ...clusterSections.map((s) => s.sectionId),
    ...regionalSections.map((s) => s.sectionId),
  ]);
  const safeSectionIds = sectionIds.filter((id) => allowedIds.has(id));
  if (safeSectionIds.length === 0) {
    return sectionIds.map((id) => ({
      sectionId: id,
      submittedCount: 0,
      totalCount: 0,
    }));
  }

  // Load all active connect groups and sections
  const groups = (await rockGet('/Groups', {
    $filter: `(GroupTypeId eq ${RockGroupType.ConnectGroupSection} or GroupTypeId eq ${RockGroupType.ConnectGroup}) and IsActive eq true`,
    $select: 'Id,ParentGroupId,GroupTypeId',
    $top: 5000,
  })) as Array<{ Id: number; ParentGroupId?: number | null; GroupTypeId?: number }>;

  const childrenByParent = new Map<number, typeof groups>();
  for (const group of groups) {
    if (!group.ParentGroupId) continue;
    const items = childrenByParent.get(group.ParentGroupId) || [];
    items.push(group);
    childrenByParent.set(group.ParentGroupId, items);
  }

  // Perform BFS for each requested sectionId to gather their connect group descendant IDs
  const groupsBySectionId = new Map<number, number[]>();
  const allGroupIdsSet = new Set<number>();

  for (const sectionId of safeSectionIds) {
    const { allIds } = await rockGetFoldedSectionIds(sectionId);
    const queue = [...allIds];
    const visited = new Set<number>(queue);
    const connectGroupIds: number[] = [];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const child of childrenByParent.get(parentId) || []) {
        if (child.GroupTypeId === RockGroupType.ConnectGroup) {
          connectGroupIds.push(child.Id);
          allGroupIdsSet.add(child.Id);
        }
        if (!visited.has(child.Id)) {
          visited.add(child.Id);
          queue.push(child.Id);
        }
      }
    }
    groupsBySectionId.set(sectionId, connectGroupIds);
  }

  const allGroupIds = Array.from(allGroupIdsSet);
  const checkedInGroupIds = new Set<number>();

  if (allGroupIds.length > 0) {
    // Get date range params for weeks = 2 (default)
    const [startDate, endDate] = getConnectWeekRangeParams({ beforeDate, afterDate, weeks: 2 });

    // Fetch events for these groupIds
    const rawEvents = await rockGetMultipleConnectEventsDateFilter(
      allGroupIds,
      startDate.toISOString(),
      endDate.toISOString()
    );

    // Any occurrence with checkin > 0 means the group submitted attendance
    for (const event of rawEvents) {
      const checkins = (event as any).stats?.checkin || 0;
      if (!checkins) continue;

      const eventGroupIds = (event.Linkages || []).map((link) => link.GroupId).filter(Boolean);
      for (const groupId of eventGroupIds) {
        checkedInGroupIds.add(groupId);
      }
    }
  }

  return sectionIds.map((sectionId) => {
    const groupIds = groupsBySectionId.get(sectionId) || [];
    const submittedCount = groupIds.filter((id) => checkedInGroupIds.has(id)).length;
    return {
      sectionId,
      submittedCount,
      totalCount: groupIds.length,
    };
  });
}
