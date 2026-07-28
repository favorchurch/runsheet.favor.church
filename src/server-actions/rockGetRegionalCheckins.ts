'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockAttendance } from '@/types/RockAttendance';
import { array, number, object } from 'zod';

const schema = object({
  occurrenceId: number().int().positive(),
  personAliasIds: array(number().int().positive()),
});

/**
 * Get checkin records for specific people at an occurrence.
 * Replaces fluroGetRegionalCheckins.
 */
export async function rockGetRegionalCheckins(
  occurrenceId: number,
  personAliasIds: number[]
): Promise<RockAttendance[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceId, personAliasIds });

  if (!personAliasIds.length) return [];

  const personFilter = personAliasIds.length === 1
    ? `PersonAliasId eq ${personAliasIds[0]}`
    : `(${personAliasIds.map(id => `PersonAliasId eq ${id}`).join(' or ')})`;

  return await rockGet('/Attendances', {
    $filter: `OccurrenceId eq ${occurrenceId} and ${personFilter}`,
    $select: 'Id,PersonAliasId,DidAttend',
  });
}
