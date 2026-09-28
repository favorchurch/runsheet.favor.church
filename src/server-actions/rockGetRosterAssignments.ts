'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  ROCK_ROSTER_ROLES,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { mergeRosterOccupants, type RosterOccupant } from '@/lib/rockRosterSlots';
import { matchRockSchedule, type RockServiceCandidate } from '@/lib/rockServiceSchedule';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

/** Rock `Attendance.RSVP`: 0 Unknown (pending), 1 No (declined), 2 Yes (confirmed). */
const ROSTERED_RSVP = new Set([0, 2]);

export interface RosterRoleAssignment {
  roleTitle: string;
  people: { personId: number; name: string }[];
}

export interface RockRosterAssignmentsResult {
  success: boolean;
  linked: boolean;
  scheduleId: number | null;
  isoDate: string | null;
  roles: RosterRoleAssignment[];
  error?: string;
}

const UNLINKED: RockRosterAssignmentsResult = {
  success: true,
  linked: false,
  scheduleId: null,
  isoDate: null,
  roles: [],
};

export async function rockGetRosterAssignments(
  channelName: string,
): Promise<RockRosterAssignmentsResult> {
  if (!isRockLinkedCampus(channelName)) return UNLINKED;

  const session = await getRockSession();
  const access = assertRunsheetViewAccess(session);
  if (!access.allowed) {
    return { ...UNLINKED, success: false, error: access.error };
  }

  try {
    // One pass per group gives both its services and its locations.
    const perGroup = await Promise.all(
      ROCK_ROSTER_GROUP_IDS.map((groupId) =>
        rockGet('/GroupLocations', {
          $filter: `GroupId eq ${groupId}`,
          $expand: 'Schedules,Location',
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

    const occurrence = matchRockSchedule(channelName, [...services.values()]);
    if (!occurrence) return UNLINKED;

    // A role Rock does not schedule for this service has no slot to read or
    // write, so it is dropped here and the card falls back to free text for it.
    const linkedRoles = ROCK_ROSTER_ROLES.map((role) => ({
      role,
      locationIds: usableRoleLocationIds(role, scheduleIdsByLocation, occurrence.scheduleId),
    })).filter((entry) => entry.locationIds.length > 0);

    if (linkedRoles.length === 0) return UNLINKED;

    const locationIds = linkedRoles.flatMap((entry) => entry.locationIds);
    const occurrences = ((await rockGet('/AttendanceOccurrences', {
      $filter: [
        `ScheduleId eq ${occurrence.scheduleId}`,
        `OccurrenceDate eq datetime'${occurrence.isoDate}T00:00:00'`,
        `(${ROCK_ROSTER_GROUP_IDS.map((id) => `GroupId eq ${id}`).join(' or ')})`,
        `(${locationIds.map((id) => `LocationId eq ${id}`).join(' or ')})`,
      ].join(' and '),
      $select: 'Id,GroupId,LocationId',
    })) || []) as any[];

    const byOccurrenceId = new Map<number, { groupId: number; locationId: number }>(
      occurrences.map((o) => [o.Id, { groupId: o.GroupId, locationId: o.LocationId }]),
    );

    const attendances = byOccurrenceId.size
      ? (((await rockGet('/Attendances', {
          $filter: [...byOccurrenceId.keys()].map((id) => `OccurrenceId eq ${id}`).join(' or '),
          $expand: 'PersonAlias/Person',
          $select:
            'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
        })) || []) as any[])
      : [];

    const occupants: RosterOccupant[] = [];
    for (const a of attendances) {
      if (!ROSTERED_RSVP.has(a.RSVP)) continue;
      const slot = byOccurrenceId.get(a.OccurrenceId);
      const person = a.PersonAlias?.Person;
      if (!slot || !a.PersonAlias?.PersonId || !person) continue;
      occupants.push({
        attendanceId: a.Id,
        personId: a.PersonAlias.PersonId,
        name: `${person.NickName || ''} ${person.LastName || ''}`.trim(),
        locationId: slot.locationId,
      });
    }

    const roles = linkedRoles.map((entry) => ({
      roleTitle: entry.role.roleTitle,
      people: mergeRosterOccupants(
        occupants.filter((o) => entry.locationIds.includes(o.locationId)),
        entry.locationIds,
      ).map((o) => ({ personId: o.personId, name: o.name })),
    }));

    return {
      success: true,
      linked: true,
      scheduleId: occurrence.scheduleId,
      isoDate: occurrence.isoDate,
      roles,
    };
  } catch (err) {
    // Fail soft: the card falls back to its stored values rather than going
    // blank minutes before a service.
    console.error('Error reading Rock roster assignments:', err);
    return { ...UNLINKED, success: false, error: 'Could not read the roster from Rock.' };
  }
}
