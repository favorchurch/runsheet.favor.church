import 'server-only';

import { ROCK_ROSTER_GROUP_IDS } from '@/lib/rockRosterRoles';
import type { RosterOccupant } from '@/lib/rockRosterSlots';
import type { RockServiceCandidate } from '@/lib/rockServiceSchedule';
import { rockGet } from '@/server-actions/internal/rockFetch';

/**
 * Rock's `RSVP` enum (`Rock.Model.RSVP`), verified against live roster rows on
 * 2026-09-29: `No = 0`, `Yes = 1`, `Maybe = 2`, `Unknown = 3`.
 *
 * Declining is the only thing that takes someone off the runsheet's roster. A
 * volunteer who has accepted, answered maybe, or not replied at all is still
 * the person the team is expecting, and the producer needs to see them — an
 * unanswered request is exactly when the card is most useful.
 *
 * Filtered in memory on purpose: Rock exposes `RSVP` as an enum over OData, so
 * `$filter=RSVP eq 1` fails with an Edm.String/Edm.Int32 type mismatch.
 */
const DECLINED_RSVP = 0;

export function isRosteredRsvp(rsvp: unknown): boolean {
  return rsvp !== DECLINED_RSVP;
}

/**
 * Rock's OData endpoint rejects any query whose expression tree exceeds 100
 * nodes, so a long `Id eq 1 or Id eq 2 or …` chain 400s rather than returning
 * results. Every id list below is therefore split into chunks and the chunks
 * fetched in parallel.
 *
 * `OR_CHUNK_SIZE` is deliberately conservative: a filter that also carries a
 * schedule and a date predicate has fewer nodes to spend on the chain.
 */
const OR_CHUNK_SIZE = 10;

function chunk<T>(items: T[], size = OR_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function orFilter(property: string, ids: number[]): string {
  return ids.map((id) => `${property} eq ${id}`).join(' or ');
}

/** Runs one chunked OData read and flattens the results. */
async function fetchChunked(
  path: string,
  ids: number[],
  buildFilter: (ids: number[]) => string,
  select: string,
): Promise<any[]> {
  if (ids.length === 0) return [];
  const pages = await Promise.all(
    chunk(ids).map(
      (batch) =>
        rockGet(path, { $filter: buildFilter(batch), $select: select }, true) as Promise<any[] | null>,
    ),
  );
  return pages.flatMap((page) => page || []);
}

export interface RosterOccupantWithGroup extends RosterOccupant {
  groupId: number;
}

/**
 * Reads everyone rostered into the given Rock Locations for one service date.
 *
 * Deliberately shaped around what Rock's OData actually supports, each point
 * verified against production on 2026-09-29:
 *
 *  - `AttendanceOccurrence` is filtered by schedule, date and location only.
 *    Adding a `GroupId eq … or …` chain on top pushed the query over the node
 *    limit; the group is read back off each occurrence and matched in memory
 *    instead, so role scoping is unchanged.
 *  - `Attendance` has **no** `PersonAlias` navigation property, so
 *    `$expand=PersonAlias/Person` 400s. Names are resolved in two further hops:
 *    `PersonAliasId` → `/PersonAlias` → `PersonId` → `/People`.
 */
export async function fetchRosterOccupants(params: {
  scheduleId: number;
  isoDate: string;
  locationIds: number[];
}): Promise<RosterOccupantWithGroup[]> {
  const { scheduleId, isoDate, locationIds } = params;
  if (locationIds.length === 0) return [];

  const occurrences = await fetchChunked(
    '/AttendanceOccurrences',
    locationIds,
    (batch) =>
      [
        `ScheduleId eq ${scheduleId}`,
        `OccurrenceDate eq datetime'${isoDate}T00:00:00'`,
        `(${orFilter('LocationId', batch)})`,
      ].join(' and '),
    'Id,GroupId,LocationId',
  );

  const slotByOccurrenceId = new Map<number, { groupId: number; locationId: number }>(
    occurrences.map((o) => [o.Id, { groupId: o.GroupId, locationId: o.LocationId }]),
  );
  if (slotByOccurrenceId.size === 0) return [];

  const attendances = await fetchChunked(
    '/Attendances',
    [...slotByOccurrenceId.keys()],
    (batch) => orFilter('OccurrenceId', batch),
    'Id,OccurrenceId,RSVP,PersonAliasId',
  );

  const rostered = attendances.filter(
    (a) => isRosteredRsvp(a.RSVP) && a.PersonAliasId && slotByOccurrenceId.has(a.OccurrenceId),
  );
  if (rostered.length === 0) return [];

  const aliases = await fetchChunked(
    '/PersonAlias',
    [...new Set(rostered.map((a) => a.PersonAliasId as number))],
    (batch) => orFilter('Id', batch),
    'Id,PersonId',
  );
  const personIdByAliasId = new Map<number, number>(aliases.map((a) => [a.Id, a.PersonId]));

  const people = await fetchChunked(
    '/People',
    [...new Set([...personIdByAliasId.values()])],
    (batch) => orFilter('Id', batch),
    'Id,NickName,LastName',
  );
  const nameByPersonId = new Map<number, string>(
    people.map((p) => [p.Id, `${p.NickName || ''} ${p.LastName || ''}`.trim()]),
  );

  const occupants: RosterOccupantWithGroup[] = [];
  for (const a of rostered) {
    const slot = slotByOccurrenceId.get(a.OccurrenceId)!;
    const personId = personIdByAliasId.get(a.PersonAliasId);
    if (!personId) continue;
    occupants.push({
      attendanceId: a.Id,
      personId,
      name: nameByPersonId.get(personId) || '',
      locationId: slot.locationId,
      groupId: slot.groupId,
    });
  }
  return occupants;
}

export interface RosterScheduleMap {
  /** Every service the five Group Scheduler teams run, for channel matching. */
  services: RockServiceCandidate[];
  /** Rock Location id → the Schedule ids attached to it. */
  scheduleIdsByLocation: Map<number, Set<number>>;
}

/**
 * Which teams run which services, and in which locations.
 *
 * Two things matter here, both learned the hard way:
 *
 *  - **Ask for four fields, not the whole graph.** `$expand=Schedules,Location`
 *    returns 561KB for one group — 90% of it expanded Schedule rows, iCalendar
 *    text included — and this runs for five groups on every runsheet open. The
 *    nested `$select` brings that to 22KB a group.
 *  - **Cache it.** Group/location/schedule wiring changes when someone rewires a
 *    team, not between page loads. Next serialises server actions, so an
 *    expensive roster read queues ahead of the runsheet's own load and the
 *    editor sits under "Updating runsheet data…" waiting for it.
 */
const SCHEDULE_MAP_TTL_MS = 10 * 60 * 1000;
let scheduleMapCache: { at: number; value: RosterScheduleMap } | null = null;

export function clearRosterScheduleMapCache(): void {
  scheduleMapCache = null;
}

export async function fetchRosterScheduleMap(): Promise<RosterScheduleMap> {
  if (scheduleMapCache && Date.now() - scheduleMapCache.at < SCHEDULE_MAP_TTL_MS) {
    return scheduleMapCache.value;
  }

  const perGroup = await Promise.all(
    ROCK_ROSTER_GROUP_IDS.map(
      (groupId) =>
        rockGet('/GroupLocations', {
          $filter: `GroupId eq ${groupId}`,
          $expand: 'Schedules',
          $select: 'GroupId,LocationId,Schedules/Id,Schedules/Name',
        }) as Promise<any[] | null>,
    ),
  );

  const services = new Map<number, RockServiceCandidate>();
  const scheduleIdsByLocation = new Map<number, Set<number>>();
  for (const rows of perGroup) {
    for (const row of rows || []) {
      const locationId = row.LocationId ?? row.Location?.Id;
      for (const schedule of row.Schedules || []) {
        if (!schedule?.Id) continue;
        services.set(schedule.Id, { scheduleId: schedule.Id, name: schedule.Name });
        if (locationId === undefined) continue;
        const set = scheduleIdsByLocation.get(locationId) ?? new Set<number>();
        set.add(schedule.Id);
        scheduleIdsByLocation.set(locationId, set);
      }
    }
  }

  const value: RosterScheduleMap = { services: [...services.values()], scheduleIdsByLocation };
  scheduleMapCache = { at: Date.now(), value };
  return value;
}
