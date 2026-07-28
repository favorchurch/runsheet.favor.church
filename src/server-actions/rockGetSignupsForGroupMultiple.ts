'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockHydrateRegistrationAliases } from '@/server-actions/internal/rockHydrateRegistrationAliases';
import { rockHydrateRegistrationTags } from '@/server-actions/internal/rockHydrateRegistrationTags';
import { RockRegistration } from '@/types/RockRegistration';
import { array, number, object, string } from 'zod';

const schema = object({
  groupIds: array(number().int().positive()),
  afterDate: string().optional(),
  limit: number().int().positive().optional(),
});

/**
 * Get registrations (signups) for multiple connect groups.
 * Replaces fluroGetConnectSignupsForGroupMultiple.
 */

export async function rockGetSignupsForGroupMultiple(
  groupIds: number[],
  afterDate?: string,
  limit?: number
): Promise<RockRegistration[]> {
  await assertAuthenticated();
  schema.parse({ groupIds, afterDate, limit });
  if (!groupIds.length) return [];

  const registrations = await batchODataFilter<RockRegistration>(
    groupIds,
    'GroupId',
    (groupFilter) => {
      const filters: string[] = [groupFilter];
      if (afterDate) {
        filters.push(`CreatedDateTime ge datetime'${afterDate}'`);
      }

      return rockGet('/Registrations', {
        $filter: filters.join(' and '),
        $expand: 'RegistrationInstance',
        $select:
          'Id,Guid,RegistrationInstanceId,PersonAliasId,GroupId,CreatedDateTime,ModifiedDateTime,IsTemporary',
        $orderby: 'CreatedDateTime desc',
        $top: limit || 200,
      }, true);
    },
    { batchSize: 15 }
  );

  const hydratedWithAliases = await rockHydrateRegistrationAliases(registrations);
  const hydratedWithTags = await rockHydrateRegistrationTags(hydratedWithAliases, true);

  // Fetch active members of the groups
  const members = await batchODataFilter<{ GroupId: number; PersonId: number }>(
    groupIds,
    'GroupId',
    (groupFilter) =>
      rockGet('/GroupMembers', {
        $filter: `${groupFilter} and GroupMemberStatus eq '1'`,
        $select: 'GroupId,PersonId',
      }, true),
    { batchSize: 15 }
  );

  const memberPersonIdsByGroupId = new Map<number, Set<number>>();
  for (const m of members) {
    if (!memberPersonIdsByGroupId.has(m.GroupId)) {
      memberPersonIdsByGroupId.set(m.GroupId, new Set());
    }
    memberPersonIdsByGroupId.get(m.GroupId)!.add(m.PersonId);
  }

  const { rockSignupArchiver } = await import('./internal/rockSignupArchiver');
  await Promise.all(
    hydratedWithTags.map((r) => {
      const gids = r.GroupId ? memberPersonIdsByGroupId.get(r.GroupId) || new Set<number>() : new Set<number>();
      return rockSignupArchiver(r, gids);
    })
  );

  return hydratedWithTags;
}
