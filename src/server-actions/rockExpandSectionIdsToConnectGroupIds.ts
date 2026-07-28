'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroupType } from '@/types/RockGroup';
import { array, number, object } from 'zod';

const schema = object({
  sectionIds: array(number().int().positive()).min(1),
});

interface GroupNode {
  Id: number;
  ParentGroupId?: number | null;
  GroupTypeId?: number;
}

export async function rockExpandSectionIdsToConnectGroupIds(sectionIds: number[]): Promise<number[]> {
  await assertAuthenticated();
  schema.parse({ sectionIds });

  const groups = (await rockGet('/Groups', {
    $filter: `(GroupTypeId eq ${RockGroupType.ConnectGroupSection} or GroupTypeId eq ${RockGroupType.ConnectGroup}) and IsActive eq true`,
    $select: 'Id,ParentGroupId,GroupTypeId',
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
  const connectGroupIds = new Set<number>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of childrenByParent.get(parentId) || []) {
      if (child.GroupTypeId === RockGroupType.ConnectGroup) {
        connectGroupIds.add(child.Id);
      }
      if (!visited.has(child.Id)) {
        visited.add(child.Id);
        queue.push(child.Id);
      }
    }
  }

  return Array.from(connectGroupIds);
}
