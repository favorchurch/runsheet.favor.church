'use server';

import { ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID } from '@/constants.client';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockHydrateWorkflowAliases } from '@/server-actions/internal/rockHydrateWorkflowAliases';
import { rockHydrateRegistrationTags } from '@/server-actions/internal/rockHydrateRegistrationTags';
import { buildWorkflowSignupsFilter } from '@/server-actions/internal/buildWorkflowSignupsFilter';
import { RockWorkflowSignup } from '@/types/RockWorkflow';

/**
 * Fetches connect-signup workflows with their attributes hydrated.
 *
 * IMPORTANT: We must NOT pass $select here. Rock returns AttributeValues with
 * null inner Values if $select is present alongside LoadAttributes=true.
 *
 * afterDate (yyyy-MM or yyyy-MM-dd) scopes by CreatedDateTime server-side —
 * verified working on Rock 17.7, including combined with LoadAttributes.
 *
 * Deleted workflows never come back from /Workflows, so orphaned AttributeValues
 * (from manually-deleted test workflows) are naturally excluded.
 */
export async function rockFetchWorkflowSignups(
  afterDate?: string,
  limit = 500,
  noCache = false
): Promise<RockWorkflowSignup[]> {
  const workflows = (await rockGet('/Workflows', {
    $filter: buildWorkflowSignupsFilter(ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID, afterDate),
    $orderby: 'CreatedDateTime desc',
    $top: limit,
    LoadAttributes: true, // NO $select — see note above
  }, noCache)) as RockWorkflowSignup[];

  if (!workflows?.length) return [];

  const withAliases = await rockHydrateWorkflowAliases(workflows);
  // rockHydrateRegistrationTags keys by .Guid, which workflows also have — entity-agnostic for reads.
  return (await rockHydrateRegistrationTags(withAliases as any, noCache)) as RockWorkflowSignup[];
}
