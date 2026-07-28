'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockCampus } from '@/types/RockCampus';
import { number, object } from 'zod';

const schema = object({
  campusId: number().int().positive(),
});

export async function rockGetCampus(campusId: number): Promise<RockCampus> {
  await assertAuthenticated();
  schema.parse({ campusId });

  return await rockGet(`/Campuses/${campusId}`);
}
