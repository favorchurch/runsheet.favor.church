'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockPerson } from '@/types/RockPerson';
import { array, number, object } from 'zod';

const schema = object({
  personIds: array(number().int().positive()),
});

export async function rockGetContactsById(...personIds: number[]): Promise<RockPerson[]> {
  await assertAuthenticated();
  schema.parse({ personIds });

  if (personIds.length === 0) return [];

  return batchODataFilter(personIds, 'Id', (idFilter) =>
    rockGet('/People', {
      $filter: idFilter,
      $select:
        'Id,FirstName,LastName,NickName,Email,Gender,BirthDate,PrimaryCampusId,RecordStatusValueId,ConnectionStatusValueId',
    })
  );
}
