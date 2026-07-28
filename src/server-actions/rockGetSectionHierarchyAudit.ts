'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleSectionId } from '@/auth0-hooks/server/assertAccessibleSectionId';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroup } from '@/types/RockGroup';
import { number, object } from 'zod';
import { rockExpandSectionIdsToConnectGroupIds } from './rockExpandSectionIdsToConnectGroupIds';
import { rockGetScopedGroupHierarchy } from './rockGetScopedGroupHierarchy';

const schema = object({
  sectionId: number().int().positive(),
});

export interface SectionAuditEntry {
  groupId: number;
  name: string;
  reason: string;
}

/**
 * Find connect groups that sit under a section in the Rock group tree but do
 * NOT resolve back into it via the name-prefix hierarchy rules ('Cluster // ' /
 * 'Region // ' nearest-ancestor matching). Edits to the section's leaders won't
 * reach these groups — the editor surfaces them as a warning.
 */
export async function rockGetSectionHierarchyAudit(
  sectionId: number,
  kind: 'cluster' | 'region'
): Promise<SectionAuditEntry[]> {
  await assertAuthenticated();
  schema.parse({ sectionId });
  await assertAccessibleSectionId(sectionId);

  const groupIds = await rockExpandSectionIdsToConnectGroupIds([sectionId]);
  if (!groupIds.length) return [];

  const rawGroups = await batchODataFilter<RockGroup>(groupIds, 'Id', (filter) =>
    rockGet('/Groups', {
      $filter: filter,
      $select: 'Id,Name,ParentGroupId,GroupTypeId',
    })
  );
  const hierarchy = await rockGetScopedGroupHierarchy(rawGroups);

  const kindLabel = kind === 'cluster' ? 'Cluster' : 'Region';
  const flagged: SectionAuditEntry[] = [];
  for (const group of rawGroups) {
    const node = hierarchy.get(group.Id);
    const resolvedId = kind === 'cluster' ? node?.clusterId : node?.regionId;
    if (resolvedId === sectionId) continue;
    flagged.push({
      groupId: group.Id,
      name: group.Name ?? `Group ${group.Id}`,
      reason:
        resolvedId == null
          ? `No '${kindLabel} //' ancestor resolves for this group`
          : `Resolves to a different ${kind} by name`,
    });
  }
  return flagged;
}
