'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockPerformCheckin } from '@/server-actions/rockPerformCheckin';
import { RockAttendance } from '@/types/RockAttendance';
import { array, number, object, string } from 'zod';

export interface RockCheckinMultiplePayload {
  occurrenceId: number;
  personAliasIds: number[];
  startDateTime?: string;
  campusId?: number;
}

const schema = object({
  occurrenceId: number().int().positive(),
  personAliasIds: array(number().int().positive()),
  startDateTime: string().optional(),
  campusId: number().int().positive().optional(),
});

export async function rockPerformCheckinMultiple({
  occurrenceId,
  personAliasIds,
  startDateTime,
  campusId,
}: RockCheckinMultiplePayload): Promise<RockAttendance[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceId, personAliasIds, startDateTime, campusId });

  return Promise.all(
    personAliasIds.map((personAliasId) =>
      rockPerformCheckin({ occurrenceId, personAliasId, startDateTime, campusId })
    )
  );
}
