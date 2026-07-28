'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { array, number, object, string } from 'zod';

export interface ConnectAttendancePerson {
  groupId: number;
  personId: number;
}

const schema = object({
  groupIds: array(number().int().positive()),
  startDate: string().optional(),
  endDate: string().optional(),
});

/**
 * Returns one { groupId, personId } per check-in (DidAttend) across the given
 * Connect groups within the date range. Deduping is the caller's job
 * (computeAgeGroupTracker). PersonAliasId is resolved to PersonId via /PersonAlias
 * because $expand=Person returns null in this Rock instance and the OData `in`
 * operator is unsupported (mirrors rockHydrateRegistrationAliases).
 */
export async function rockGetConnectAttendancePersonIdsDateFilter(
  groupIds: number[],
  startDate?: string,
  endDate?: string,
): Promise<ConnectAttendancePerson[]> {
  await assertAuthenticated();
  schema.parse({ groupIds, startDate, endDate });
  if (!groupIds.length) return [];

  // 1. Occurrences in range; keep occurrenceId -> groupId
  const occurrences: Array<{ Id: number; GroupId: number }> = await batchODataFilter(
    groupIds,
    'GroupId',
    (groupFilter) => {
      const filters: string[] = [groupFilter];
      if (startDate) filters.push(`OccurrenceDate ge datetime'${startDate.split('T')[0]}T00:00:00'`);
      if (endDate) filters.push(`OccurrenceDate lt datetime'${endDate.split('T')[0]}T00:00:00'`);
      return rockGet('/AttendanceOccurrences', {
        $filter: filters.join(' and '),
        $select: 'Id,GroupId',
        $top: groupIds.length * 4,
      });
    },
    { batchSize: 14 },
  );
  if (!occurrences.length) return [];

  const groupIdByOccurrenceId = new Map<number, number>();
  for (const occ of occurrences) groupIdByOccurrenceId.set(occ.Id, occ.GroupId);

  // 2. Attendances (DidAttend) with PersonAliasId
  const occurrenceIds = occurrences.map((o) => o.Id);
  const attendances: Array<{ OccurrenceId: number; PersonAliasId: number | null }> =
    await batchODataFilter(
      occurrenceIds,
      'OccurrenceId',
      (occFilter) =>
        rockGet('/Attendances', {
          $filter: `(${occFilter}) and DidAttend eq true`,
          $select: 'Id,OccurrenceId,PersonAliasId',
          $top: occurrences.length * 500,
        }),
      { batchSize: 15 },
    );

  const aliasIds = Array.from(
    new Set(attendances.map((a) => a.PersonAliasId).filter((id): id is number => !!id)),
  );
  if (!aliasIds.length) return [];

  // 3. Resolve PersonAliasId -> PersonId via /PersonAlias with batched or-chains
  const ALIAS_BATCH = 10;
  const aliasBatches: number[][] = [];
  for (let i = 0; i < aliasIds.length; i += ALIAS_BATCH) {
    aliasBatches.push(aliasIds.slice(i, i + ALIAS_BATCH));
  }
  const aliasResponses = await Promise.all(
    aliasBatches.map((batch) =>
      rockGet('/PersonAlias', {
        $filter: `(${batch.map((id) => `Id eq ${id}`).join(' or ')})`,
        $select: 'Id,PersonId',
      }),
    ),
  );
  const personIdByAliasId = new Map<number, number>();
  for (const alias of aliasResponses.flat() as Array<{ Id?: number; PersonId?: number }>) {
    if (alias?.Id && alias?.PersonId) personIdByAliasId.set(alias.Id, alias.PersonId);
  }

  // 4. Map each check-in to { groupId, personId }
  const result: ConnectAttendancePerson[] = [];
  for (const a of attendances) {
    if (!a.PersonAliasId) continue;
    const personId = personIdByAliasId.get(a.PersonAliasId);
    const groupId = groupIdByOccurrenceId.get(a.OccurrenceId);
    if (personId && groupId) result.push({ groupId, personId });
  }
  return result;
}
