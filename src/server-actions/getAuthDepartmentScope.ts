'use server';

import { getAuthDepartmentSections } from '@/auth0-hooks/server/getAuthDepartmentSections';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetCampuses } from '@/server-actions/rockGetCampuses';
import { SectionAccess } from '@/types/AuthUser';
import { RockCampus } from '@/types/RockCampus';
import { RockGroupType } from '@/types/RockGroup';
import { uniqBy } from 'lodash';

export interface DepartmentCampusOption {
  id: number;
  name: string;
  shortCode?: string;
}

export interface DepartmentScope {
  /**
   * Campuses the department head can scope to, ordered by Rock `Campus.Order`.
   * These are the campuses of the head's DESCENDANT sections — so a "Global
   * umbrella" head gets Manila/Brisbane/Seoul and the umbrella campus itself
   * drops out structurally (it has no descendant section on its own campus).
   */
  campusOptions: DepartmentCampusOption[];
  /** Reachable connect-group ids bucketed by their own `CampusId`. */
  connectGroupIdsByCampus: Map<number, number[]>;
  /**
   * Direct ∪ descendant sections. Filtering this by the selected campus yields
   * the sections whose members are that campus's leaders/heads (the direct
   * top section survives for normal single-campus heads; the umbrella section
   * never matches a selectable campus, so it is excluded from every view).
   */
  allScopeSections: SectionAccess[];
}

interface GroupNode {
  Id: number;
  ParentGroupId?: number | null;
  GroupTypeId?: number;
  Name?: string;
  CampusId?: number | null;
}

// Mirrors classifySection in rockResolveAccess / rockExpandSectionIdsToChildSections.
function classifySection(name: string): SectionAccess['kind'] {
  if (name.startsWith('Region //')) return 'region';
  if (name.startsWith('Cluster //')) return 'cluster';
  return 'department';
}

/**
 * Consolidated scope resolver for the department dashboard. Fetches the connect
 * group tree and the campus list exactly once (in parallel), then derives — in
 * a single BFS down from the head's direct sections — the descendant sections,
 * the campus-bucketed connect groups, and the ordered campus options. Both the
 * page (data filtering) and the campus selector (props) read from this, so they
 * can never disagree.
 *
 * Campus IDs are resolved dynamically from Rock; nothing is hardcoded.
 */
export async function getAuthDepartmentScope(): Promise<DepartmentScope> {
  const directSections = await getAuthDepartmentSections(); // dept-head gate (throws for others)

  const [groups, campuses] = await Promise.all([
    rockGet('/Groups', {
      $filter: `(GroupTypeId eq ${RockGroupType.ConnectGroupSection} or GroupTypeId eq ${RockGroupType.ConnectGroup}) and IsActive eq true`,
      $select: 'Id,ParentGroupId,GroupTypeId,Name,CampusId',
      $top: 5000,
    }) as Promise<GroupNode[]>,
    rockGetCampuses(),
  ]);

  const childrenByParent = new Map<number, GroupNode[]>();
  for (const group of groups) {
    if (!group.ParentGroupId) continue;
    const items = childrenByParent.get(group.ParentGroupId) || [];
    items.push(group);
    childrenByParent.set(group.ParentGroupId, items);
  }

  const queue = [...new Set(directSections.map((s) => s.sectionId))];
  const visited = new Set<number>(queue);
  const descendantSections: SectionAccess[] = [];
  const connectGroupIdsByCampus = new Map<number, number[]>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of childrenByParent.get(parentId) || []) {
      if (child.GroupTypeId === RockGroupType.ConnectGroupSection) {
        descendantSections.push({
          sectionId: child.Id,
          campusId: child.CampusId != null ? Number(child.CampusId) : null,
          kind: classifySection(String(child.Name || '')),
          name: String(child.Name || ''),
        });
      } else if (child.GroupTypeId === RockGroupType.ConnectGroup && child.CampusId != null) {
        const campusId = Number(child.CampusId);
        const bucket = connectGroupIdsByCampus.get(campusId) || [];
        bucket.push(child.Id);
        connectGroupIdsByCampus.set(campusId, bucket);
      }
      if (!visited.has(child.Id)) {
        visited.add(child.Id);
        queue.push(child.Id);
      }
    }
  }

  // Choices come from descendants (drops the umbrella); a leaf head with no
  // descendant sections falls back to its own direct sections.
  const choiceSections = descendantSections.length ? descendantSections : directSections;
  const allScopeSections = uniqBy([...directSections, ...descendantSections], (s) => s.sectionId);

  const campusById = new Map(campuses.map((c) => [c.Id, c]));
  const choiceCampusIds = [
    ...new Set(
      choiceSections
        .map((s) => s.campusId)
        .filter((id): id is number => typeof id === 'number' && id > 0)
    ),
  ];

  const campusOptions: DepartmentCampusOption[] = choiceCampusIds
    .map((id) => campusById.get(id) ?? ({ Id: id } as RockCampus))
    .sort(
      (a, b) =>
        (a.Order ?? Number.MAX_SAFE_INTEGER) - (b.Order ?? Number.MAX_SAFE_INTEGER) ||
        (a.Name ?? '').localeCompare(b.Name ?? '')
    )
    .map((c) => ({
      id: c.Id,
      name: c.Name ?? `Campus ${c.Id}`,
      shortCode: c.ShortCode || undefined,
    }));

  return { campusOptions, connectGroupIdsByCampus, allScopeSections };
}
