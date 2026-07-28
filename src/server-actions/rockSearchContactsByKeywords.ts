'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { SEARCH_LIMIT_COUNT, SEARCH_PREFIX_LENGTH } from '@/constants.client';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockPerson } from '@/types/RockPerson';
import { number, object, string } from 'zod';

const schema = object({
  keywords: string(),
  campusId: number().int().positive().optional(),
});

export async function rockSearchContactsByKeywords(
  keywords: string,
  campusId?: number
): Promise<RockPerson[]> {
  await assertAuthenticated();
  schema.parse({ keywords, campusId });

  const trimmed = keywords.trim();
  if (trimmed.length < SEARCH_PREFIX_LENGTH) return [];
  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const nameFilter = tokens
    .map((token) => {
      const escaped = token.replace(/'/g, "''");
      return `(
        substringof('${escaped}',FirstName)
        or substringof('${escaped}',LastName)
        or substringof('${escaped}',NickName)
      )`.replace(/\s+/g, ' ');
    })
    .join(' and ');

  const campusClause = campusId ? ` and PrimaryCampusId eq ${campusId}` : '';

  return await rockGet('/People', {
    $filter: `${nameFilter}${campusClause} and RecordStatusValueId eq 3 and IsDeceased eq false`,
    $select: 'Id,FirstName,LastName,NickName,Email,Gender,BirthDate,PrimaryCampusId,PrimaryAliasId',
    $expand: 'PhoneNumbers',
    $top: SEARCH_LIMIT_COUNT,
    $orderby: 'LastName,FirstName',
  });
}
