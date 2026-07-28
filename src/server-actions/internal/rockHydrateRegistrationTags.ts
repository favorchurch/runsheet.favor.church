'use server';

import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockRegistration } from '@/types/RockRegistration';



/**
 * Hydrate registrations with their tags from Rock TaggedItems.
 * Performs a single bulk fetch for efficiency.
 */
export async function rockHydrateRegistrationTags(
  registrations: RockRegistration[],
  noCache = false
): Promise<RockRegistration[]> {
  if (!registrations?.length) return [];

  // Ensure all registrations have a Guid (they should if they were fetched with $select: 'Id,Guid,...')
  const registrationGuids = registrations.map((r) => r.Guid).filter((g): g is string => !!g && g.length > 0);
  if (registrationGuids.length === 0) return registrations;

  const uniqueGuids = Array.from(new Set(registrationGuids));
  const BATCH_SIZE = 10;
  const batches: string[][] = [];
  for (let i = 0; i < uniqueGuids.length; i += BATCH_SIZE) {
    batches.push(uniqueGuids.slice(i, i + BATCH_SIZE));
  }

  // Fetch all tags for these registrations in one go, batched to avoid OData MaxNodeCount errors
  const responses = await Promise.all(
    batches.map((batch) => {
      const guidFilter = batch.map((guid) => `EntityGuid eq guid'${guid}'`).join(' or ');
      return rockGet('/TaggedItems', {
        $filter: `(${guidFilter})`,
        $select: 'EntityGuid,TagId',
      }, noCache);
    })
  );

  const allTags = responses.flat() as any[];

  // Map tags back to registrations using Guid
  const tagsByGuid: Record<string, number[]> = {};
  (allTags || []).forEach((t) => {
    if (!tagsByGuid[t.EntityGuid]) {
      tagsByGuid[t.EntityGuid] = [];
    }
    tagsByGuid[t.EntityGuid].push(t.TagId);
  });

  return registrations.map((r) => ({
    ...r,
    tags: r.Guid ? tagsByGuid[r.Guid] || [] : [],
  }));
}
