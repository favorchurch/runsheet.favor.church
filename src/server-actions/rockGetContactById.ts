'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockPerson } from '@/types/RockPerson';
import { number, object } from 'zod';

const schema = object({
  personId: number().int().positive(),
});

export async function rockGetContactById(personId: number): Promise<RockPerson> {
  await assertAuthenticated();
  schema.parse({ personId });

  return await rockGet(`/People/${personId}`);
}
