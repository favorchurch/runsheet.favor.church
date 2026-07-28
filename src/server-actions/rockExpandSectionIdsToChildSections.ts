'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { SectionAccess } from '@/types/AuthUser';
import { RockGroupType } from '@/types/RockGroup';
import { array, number, object } from 'zod';

const schema = object({
  sectionIds: array(number().int().positive()).min(1),
});

interface GroupNode {
  Id: number;
  ParentGroupId?: number | null;
  GroupTypeId?: number;
  Name?: string;
  CampusId?: number | null;
}

function classifySection(name: string): SectionAccess['kind'] {
  if (name.startsWith('Region //')) return 'region';
  if (name.startsWith('Cluster //')) return 'cluster';
  return 'department';
}

/**
 * Expand parent section IDs (GroupType 24) down through all descendant sections
 * and return those descendant sections as SectionAccess[]. Optionally filter to a
 * single classification (e.g. 'cluster' sections under a department).
 *
 * Mirrors rockExpandSectionIdsToConnectGroupIds, but collects intermediate
 * sections instead of leaf connect groups.
 */
export async function rockExpandSectionIdsToChildSections(
  sectionIds: number[],
  kind?: SectionAccess['kind']
): Promise<SectionAccess[]> {
  await assertAuthenticated();
  if (!sectionIds.length) return [];
  schema.parse({ sectionIds });

  const groups = (await rockGet('/Groups', {
    $filter: `(GroupTypeId eq ${RockGroupType.ConnectGroupSection} or GroupTypeId eq ${RockGroupType.ConnectGroup}) and IsActive eq true`,
    $select: 'Id,ParentGroupId,GroupTypeId,Name,CampusId',
    $top: 5000,
  })) as GroupNode[];

  const childrenByParent = new Map<number, GroupNode[]>();
  for (const group of groups) {
    if (!group.ParentGroupId) continue;
    const items = childrenByParent.get(group.ParentGroupId) || [];
    items.push(group);
    childrenByParent.set(group.ParentGroupId, items);
  }

  const queue = [...new Set(sectionIds)];
  const visited = new Set<number>(queue);
  const sectionsById = new Map<number, SectionAccess>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of childrenByParent.get(parentId) || []) {
      if (child.GroupTypeId === RockGroupType.ConnectGroupSection) {
        sectionsById.set(child.Id, {
          sectionId: child.Id,
          campusId: child.CampusId != null ? Number(child.CampusId) : null,
          kind: classifySection(String(child.Name || '')),
          name: String(child.Name || ''),
        });
      }
      if (!visited.has(child.Id)) {
        visited.add(child.Id);
        queue.push(child.Id);
      }
    }
  }

  const result = Array.from(sectionsById.values());
  return kind ? result.filter((s) => s.kind === kind) : result;
}
