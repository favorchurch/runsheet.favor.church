'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockNoteType } from '@/types/RockNote';

// Rock EntityTypeId for Group
const GROUP_ENTITY_TYPE_ID = 16;

/**
 * Get care note type definitions.
 * Replaces fluroGetCareNotesDefinitionTitles.
 */
export async function rockGetCareNotesDefinitionTitles(): Promise<RockNoteType[]> {
  await assertAuthenticated();

  return await rockGet('/NoteTypes', {
    $filter: `EntityTypeId eq ${GROUP_ENTITY_TYPE_ID} and UserSelectable eq true`,
    $orderby: 'Order',
  });
}
