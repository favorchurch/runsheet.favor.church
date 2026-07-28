'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockCampus } from '@/types/RockCampus';

/**
 * All active campuses in one request.
 *
 * Batched counterpart to `rockGetCampus` (single fetch by id): callers that
 * need several campuses' names/short codes should use this to avoid N round
 * trips. Campus IDs are environment-specific and never hardcoded — resolve
 * them from this list at runtime. See AGENTS.md ("Rock Campus IDs").
 */
export async function rockGetCampuses(): Promise<RockCampus[]> {
  await assertAuthenticated();

  const campuses = (await rockGet('/Campuses', {
    $select: 'Id,Name,ShortCode,Order,IsActive',
    $top: 100,
  })) as RockCampus[];

  return (campuses ?? []).filter((campus) => campus.IsActive !== false);
}
