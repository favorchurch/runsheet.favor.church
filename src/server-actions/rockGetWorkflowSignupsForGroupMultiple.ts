'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockFetchActiveWorkflowSignups } from '@/server-actions/internal/rockFetchActiveWorkflowSignups';
import { RockWorkflowSignup, workflowGroupId } from '@/types/RockWorkflow';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { array, number, object, string } from 'zod';

const schema = object({
  groupIds: array(number().int().positive()),
  afterDate: string().optional(),
  limit: number().int().positive().optional(),
});

export async function rockGetWorkflowSignupsForGroupMultiple(
  groupIds: number[],
  afterDate?: string,
  limit?: number
): Promise<RockWorkflowSignup[]> {
  await assertAuthenticated();
  schema.parse({ groupIds, afterDate, limit });
  if (!groupIds.length) return [];

  const wanted = new Set(groupIds);
  const all = await rockFetchActiveWorkflowSignups(afterDate, limit ?? 2000);
  const filtered = all.filter((w) => {
    const gid = workflowGroupId(w);
    return gid !== undefined && wanted.has(gid);
  });

  if (!filtered.length) return [];

  // Fetch active members of the groups
  const members = await batchODataFilter<{ GroupId: number; PersonId: number }>(
    groupIds,
    'GroupId',
    (groupFilter) =>
      rockGet('/GroupMembers', {
        $filter: `${groupFilter} and GroupMemberStatus eq '1'`,
        $select: 'GroupId,PersonId',
      }, true)
  );

  const memberPersonIdsByGroupId = new Map<number, Set<number>>();
  for (const m of members) {
    if (!memberPersonIdsByGroupId.has(m.GroupId)) {
      memberPersonIdsByGroupId.set(m.GroupId, new Set());
    }
    memberPersonIdsByGroupId.get(m.GroupId)!.add(m.PersonId);
  }

  const { rockWorkflowSignupArchiver } = await import('./internal/rockSignupArchiver');
  await Promise.all(
    filtered.map((w) => {
      const gid = workflowGroupId(w);
      const gids = gid ? memberPersonIdsByGroupId.get(gid) || new Set<number>() : new Set<number>();
      return rockWorkflowSignupArchiver(w, gids);
    })
  );

  return filtered;
}
