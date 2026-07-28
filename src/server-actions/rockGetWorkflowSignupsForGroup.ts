'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockFetchWorkflowSignups } from '@/server-actions/internal/rockFetchWorkflowSignups';
import { RockWorkflowSignup, workflowGroupId } from '@/types/RockWorkflow';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { number, object, string } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  afterDate: string().optional(),
});

export async function rockGetWorkflowSignupsForGroup(
  groupId: number,
  afterDate?: string
): Promise<RockWorkflowSignup[]> {
  await assertAuthenticated();
  schema.parse({ groupId, afterDate });

  const all = await rockFetchWorkflowSignups(afterDate, 500, true);
  const filtered = all.filter((w) => workflowGroupId(w) === groupId);

  if (!filtered.length) return [];

  // Fetch active members of the group
  const members = (await rockGet('/GroupMembers', {
    $filter: `GroupId eq ${groupId} and GroupMemberStatus eq '1'`,
    $select: 'PersonId',
  }, true)) as { PersonId: number }[];
  const memberPersonIds = new Set(members.map((m) => m.PersonId));

  const { rockWorkflowSignupArchiver } = await import('./internal/rockSignupArchiver');
  await Promise.all(filtered.map((w) => rockWorkflowSignupArchiver(w, memberPersonIds)));

  return filtered;
}
