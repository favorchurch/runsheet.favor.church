// src/server-actions/internal/rockHydrateWorkflowAliases.ts
'use server';

import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockPerson } from '@/types/RockPerson';
import { RockWorkflowSignup } from '@/types/RockWorkflow';
import { keyBy } from 'lodash';

// Proven scalar person fields (mirrors rockGetContactsById). $expand=Person on
// /PersonAlias returns null in this Rock instance, so we resolve People directly.
const PERSON_SELECT =
  'Id,FirstName,LastName,NickName,Email,Gender,BirthDate,PrimaryCampusId,RecordStatusValueId,ConnectionStatusValueId';

/**
 * Hydrates workflow signups with Person data.
 * Workflows store the signer as a PersonAlias Guid in AttributeValues.Person.Value,
 * so we resolve PersonAlias (with Person expanded) by Guid.
 */
export async function rockHydrateWorkflowAliases(
  workflows: RockWorkflowSignup[]
): Promise<RockWorkflowSignup[]> {
  const guids = workflows
    .map((w) => w.AttributeValues?.Person?.Value)
    .filter((g): g is string => !!g && g.length > 0);

  if (guids.length === 0) return workflows;

  const uniqueGuids = Array.from(new Set(guids));
  const BATCH_SIZE = 10;
  const batches: string[][] = [];
  for (let i = 0; i < uniqueGuids.length; i += BATCH_SIZE) {
    batches.push(uniqueGuids.slice(i, i + BATCH_SIZE));
  }

  const responses = await Promise.all(
    batches.map((batch) =>
      rockGet('/PersonAlias', {
        $filter: `(${batch.map((g) => `Guid eq guid'${g}'`).join(' or ')})`,
        $select: 'Id,PersonId,Guid',
      })
    )
  );

  const aliases = responses.flat();
  const aliasByGuid = keyBy(aliases, 'Guid');

  // Resolve the actual Person records by PersonId. The $expand=Person above
  // returns null in this Rock instance, so fetch /People directly.
  const personIds = Array.from(
    new Set(
      aliases
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

  return workflows.map((w) => {
    const guid = w.AttributeValues?.Person?.Value;
    const alias = guid ? aliasByGuid[guid] : undefined;
    if (alias) {
      return {
        ...w,
        PersonAliasId: alias.Id,
        RegistrantPersonAlias: { ...alias, Person: peopleById[alias.PersonId] },
      };
    }
    return w;
  });
}
