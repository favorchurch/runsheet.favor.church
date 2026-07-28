'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockNote } from '@/types/RockNote';
import { RockPerson } from '@/types/RockPerson';
import { number, object } from 'zod';

const schema = object({
  groupId: number().int().positive(),
});

/**
 * Get care notes for a connect group.
 * Replaces fluroGetCareNotesForGroup.
 *
 * In Rock, care notes are stored as Notes linked to the Group entity.
 */
export async function rockGetCareNotesForGroup(
  groupId: number
): Promise<RockNote[]> {
  await assertAuthenticated();
  schema.parse({ groupId });

  const notes: (RockNote & { CreatedByPersonAlias?: { PersonId?: number; Person?: RockPerson } })[] = await rockGet('/Notes', {
    $filter: `EntityId eq ${groupId}`,
    $expand: 'NoteType,CreatedByPersonAlias',
    $orderby: 'CreatedDateTime desc',
    $top: 100,
  });

  const personIds = Array.from(
    new Set(
      notes
        .map((n) => n.CreatedByPersonAlias?.PersonId)
        .filter((id): id is number => !!id)
    )
  );

  const people = personIds.length > 0
    ? await batchODataFilter<RockPerson>(personIds, 'Id', (filter) =>
        rockGet('/People', { $filter: filter })
      )
    : [];
  const personMap = new Map(people.map((p) => [p.Id, p]));

  for (const note of notes) {
    if (note.CreatedByPersonAlias?.PersonId) {
      note.CreatedByPersonAlias.Person = personMap.get(note.CreatedByPersonAlias.PersonId);
    }
  }

  return notes;
}
