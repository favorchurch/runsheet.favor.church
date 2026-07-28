'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroupMemberStatus } from '@/types/RockGroupMember';
import { array, number, object } from 'zod';

const schema = object({ groupIds: array(number().int().positive()) });

/**
 * Returns the unique active member PersonIds across the given groups/sections.
 * GroupMembers carry PersonId directly, so no PersonAlias resolution is needed.
 */
export async function rockGetGroupMemberPersonIds(groupIds: number[]): Promise<number[]> {
  await assertAuthenticated();
  schema.parse({ groupIds });
  if (groupIds.length === 0) return [];

  const members: Array<{ PersonId?: number }> = await batchODataFilter(
    groupIds,
    'GroupId',
    (filter) =>
      rockGet('/GroupMembers', {
        // Rock exposes GroupMemberStatus as an Edm.String in OData filters.
        $filter: `${filter} and GroupMemberStatus eq '${RockGroupMemberStatus.Active}'`,
        $select: 'Id,GroupId,PersonId',
      }),
  );

  return Array.from(
    new Set(members.map((m) => m.PersonId).filter((id): id is number => !!id)),
  );
}
