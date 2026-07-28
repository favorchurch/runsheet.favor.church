'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItem } from '@/types/RockEvent';
import { number, object } from 'zod';

const schema = object({
  eventItemId: number().int().positive(),
});

export async function rockGetEventById(eventItemId: number): Promise<RockEventItem> {
  await assertAuthenticated();
  schema.parse({ eventItemId });

  return await rockGet(`/EventItems/${eventItemId}`, {
    $expand: 'EventItemOccurrences',
  });
}
