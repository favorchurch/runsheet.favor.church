'use server';

import { ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID } from '@/constants.client';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { buildWorkflowSignupsFilter } from '@/server-actions/internal/buildWorkflowSignupsFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockHydrateRegistrationTags } from '@/server-actions/internal/rockHydrateRegistrationTags';
import { rockHydrateWorkflowAliases } from '@/server-actions/internal/rockHydrateWorkflowAliases';
import { RockWorkflowSignup } from '@/types/RockWorkflow';
import { WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY } from '@/types/WorkflowSignupStatus';

const PAGE_SIZE = 1000;

/**
 * Fetches ONLY non-archived connect-signup workflows, without a fixed cap on
 * how far back they go. The naive fetch (newest $top=N full rows) breaks after
 * the Fluro history migration: 3,000+ archived workflows crowd out the ~90
 * active ones. Instead: page cheap Id lists, subtract the EntityIds holding
 * connectPortalArchived=True, and batch-fetch only the survivors with
 * LoadAttributes (no $select — Rock nulls inner AttributeValues otherwise).
 */
export async function rockFetchActiveWorkflowSignups(
  afterDate?: string,
  limit = 2000
): Promise<RockWorkflowSignup[]> {
  const filter = buildWorkflowSignupsFilter(ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID, afterDate);

  // 1. All candidate workflow ids ($select=Id is cheap; $skip paging verified on Rock 17.7).
  const ids: number[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = (await rockGet('/Workflows', {
      $filter: filter,
      $select: 'Id',
      $orderby: 'Id desc',
      $top: PAGE_SIZE,
      $skip: skip,
    }, true)) as { Id: number }[];
    ids.push(...page.map((w) => w.Id));
    if (page.length < PAGE_SIZE) break;
  }
  if (!ids.length) return [];

  // 2. Archived workflow ids. Resolve the attribute by key + qualifier — its Id
  //    differs per environment (preview 10325, prod 8989).
  const archivedAttrs = (await rockGet('/Attributes', {
    $filter:
      `Key eq '${WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY}' and ` +
      `EntityTypeQualifierColumn eq 'WorkflowTypeId' and ` +
      `EntityTypeQualifierValue eq '${ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID}'`,
    $select: 'Id',
  }, true)) as { Id: number }[];

  const archivedIds = new Set<number>();
  if (archivedAttrs.length) {
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = (await rockGet('/AttributeValues', {
        $filter: `AttributeId eq ${archivedAttrs[0].Id} and Value eq 'True'`,
        $select: 'EntityId',
        $top: PAGE_SIZE,
        $skip: skip,
      }, true)) as { EntityId: number }[];
      page.forEach((v) => archivedIds.add(v.EntityId));
      if (page.length < PAGE_SIZE) break;
    }
  }

  // 3. Full rows for the active ids only. `limit` is a safety valve, not a UX
  //    cap — active signups number ~90 today. Ids are newest-created first
  //    (Id desc), so if the cap ever bites it drops the oldest rows.
  const activeIds = ids.filter((id) => !archivedIds.has(id)).slice(0, limit);
  if (!activeIds.length) return [];

  const workflows = await batchODataFilter<RockWorkflowSignup>(activeIds, 'Id', (idFilter) =>
    rockGet('/Workflows', {
      $filter: idFilter,
      LoadAttributes: true, // NO $select — see note above
    }, true)
  );

  const withAliases = await rockHydrateWorkflowAliases(workflows);
  // rockHydrateRegistrationTags keys by .Guid, which workflows also have — entity-agnostic for reads.
  return (await rockHydrateRegistrationTags(withAliases as any, true)) as RockWorkflowSignup[];
}
