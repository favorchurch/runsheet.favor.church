'use server';

import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockPerson } from '@/types/RockPerson';
import { RockRegistration } from '@/types/RockRegistration';
import { keyBy } from 'lodash';

// Proven scalar person fields (mirrors rockGetContactsById). $expand=Person on
// /PersonAlias returns null in this Rock instance, so we resolve People directly.
const PERSON_SELECT =
  'Id,FirstName,LastName,NickName,Email,Gender,BirthDate,PrimaryCampusId,RecordStatusValueId,ConnectionStatusValueId';

/**
 * Hydrates an array of Rock registrations with their corresponding Person data.
 * Uses the OData 'in' operator for efficient bulk lookups.
 *
 * @param registrations - Array of registrations to hydrate
 * @returns Hydrated registrations
 */
export async function rockHydrateRegistrationAliases(
  registrations: RockRegistration[]
): Promise<RockRegistration[]> {
  const personAliasIds = registrations
    .map((r) => r.PersonAliasId)
    .filter((id): id is number => !!id);

  if (personAliasIds.length === 0) return registrations;

  // Use 'or' chains as Rock OData parser does not fully support 'in' operator.
  const uniqueIds = Array.from(new Set(personAliasIds));
  
  const BATCH_SIZE = 10;
  const batches: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + BATCH_SIZE));
  }

  const personAliasResponses = await Promise.all(
    batches.map((batch) =>
      rockGet('/PersonAlias', {
        $filter: `(${batch.map(id => `Id eq ${id}`).join(' or ')})`,
        $select: 'Id,PersonId',
      })
    )
  );

  const personAliases = personAliasResponses.flat();
  const personAliasMap = keyBy(personAliases, 'Id');

  // Resolve the actual Person records by PersonId. The $expand=Person above
  // returns null in this Rock instance, so fetch /People directly.
  const personIds = Array.from(
    new Set(
      personAliases
        .map((a) => a.PersonId)
        .filter((id): id is number => !!id)
    )
  );

  const people = await batchODataFilter<RockPerson>(personIds, 'Id', (idFilter) =>
    rockGet('/People', {
      $filter: idFilter,
      $select: PERSON_SELECT,
      $expand: 'PhoneNumbers',
    })
  );
  const peopleById = keyBy(people, 'Id');

  return registrations.map((r) => {
    if (r.PersonAliasId && personAliasMap[r.PersonAliasId]) {
      const alias = personAliasMap[r.PersonAliasId];
      return {
        ...r,
        RegistrantPersonAlias: { ...alias, Person: peopleById[alias.PersonId] },
      };
    }
    return r;
  });
}
