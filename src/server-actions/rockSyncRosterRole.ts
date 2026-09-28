'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import {
  getRockRosterRole,
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { planRosterSlots, type RosterOccupant } from '@/lib/rockRosterSlots';
import { matchRockSchedule, type RockServiceCandidate } from '@/lib/rockServiceSchedule';
import { extractChannelDate } from '@/lib/runsheetDate';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';

const ROSTERED_RSVP = new Set([0, 2]);

export interface RockSyncRosterRoleResult {
  success: boolean;
  people: { personId: number; name: string }[];
  error?: string;
}

function fail(error: string): RockSyncRosterRoleResult {
  return { success: false, people: [], error };
}

function isPastChannel(channelName: string): boolean {
  const date = extractChannelDate(channelName);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

/**
 * Writes one roster role back to Rock Group Scheduler.
 *
 * Only the named role is touched. Removals unschedule; additions are created
 * confirmed; anyone who stays keeps their existing assignment untouched. A
 * rejected plan applies nothing at all.
 */
export async function rockSyncRosterRole(input: {
  channelName: string;
  roleTitle: string;
  personIds: number[];
}): Promise<RockSyncRosterRoleResult> {
  const { channelName, roleTitle, personIds } = input;

  const session = await getRockSession();
  // The same per-channel gate every other mutation uses: a coarse "is an
  // editor" check would let a Grow-only Head, or an editor scoped to another
  // campus, write MNL service rosters straight into Rock.
  const access = await assertRunsheetEditAccess(session, channelName);
  if (!access.allowed) {
    return fail(access.error || 'You do not have permission to edit this roster.');
  }
  if (isPastChannel(channelName)) {
    return fail('This runsheet is in the past, so its roster can no longer be changed.');
  }

  const role = getRockRosterRole(roleTitle);
  if (!role || !isRockLinkedCampus(channelName)) {
    return fail('This role is not linked to Rock.');
  }

  try {
    // Resolve the occurrence from every linked group, exactly as the read does,
    // so a role whose own team does not carry the schedule reports *that* rather
    // than "no such service".
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
    if (!occurrence) return fail('This runsheet does not match a Rock service.');

    // Only the slots this role really has for this service. Empty means Rock has
    // nowhere to put anyone, so the role stays free text and nothing is written.
    const usableLocationIds = usableRoleLocationIds(
      role,
      scheduleIdsByLocation,
      occurrence.scheduleId,
    );
    if (usableLocationIds.length === 0) {
      return fail('Rock does not schedule this role for this service.');
    }

    const occurrenceRows = ((await rockGet('/AttendanceOccurrences', {
      $filter: [
        `ScheduleId eq ${occurrence.scheduleId}`,
        `OccurrenceDate eq datetime'${occurrence.isoDate}T00:00:00'`,
        `GroupId eq ${role.groupId}`,
        `(${usableLocationIds.map((id) => `LocationId eq ${id}`).join(' or ')})`,
      ].join(' and '),
      $select: 'Id,LocationId',
    }, true)) || []) as any[];

    const occurrenceIdByLocation = new Map<number, number>(
      occurrenceRows.map((o) => [o.LocationId, o.Id]),
    );
    const locationByOccurrenceId = new Map<number, number>(
      occurrenceRows.map((o) => [o.Id, o.LocationId]),
    );

    const attendances = occurrenceRows.length
      ? (((await rockGet('/Attendances', {
          $filter: occurrenceRows.map((o) => `OccurrenceId eq ${o.Id}`).join(' or '),
          $expand: 'PersonAlias/Person',
          $select:
            'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
        }, true)) || []) as any[])
      : [];

    const occupants: RosterOccupant[] = [];
    for (const a of attendances) {
      if (!ROSTERED_RSVP.has(a.RSVP)) continue;
      const locationId = locationByOccurrenceId.get(a.OccurrenceId);
      const person = a.PersonAlias?.Person;
      if (locationId === undefined || !a.PersonAlias?.PersonId || !person) continue;
      occupants.push({
        attendanceId: a.Id,
        personId: a.PersonAlias.PersonId,
        name: `${person.NickName || ''} ${person.LastName || ''}`.trim(),
        locationId,
      });
    }

    const plan = planRosterSlots(occupants, personIds, usableLocationIds);
    if (plan.error) return fail(plan.error);

    // Removals first, so a swap frees the slot before it is refilled.
    for (const attendanceId of plan.removes) {
      await rockPut('/Attendances/ScheduledPersonRemove', { attendanceId });
    }

    for (const add of plan.adds) {
      let occurrenceId = occurrenceIdByLocation.get(add.locationId);
      if (!occurrenceId) {
        const created = await rockPost('/AttendanceOccurrences', {
          GroupId: role.groupId,
          LocationId: add.locationId,
          ScheduleId: occurrence.scheduleId,
          OccurrenceDate: `${occurrence.isoDate}T00:00:00`,
        });
        occurrenceId = typeof created === 'number' ? created : created?.Id;
        if (!occurrenceId) return fail('Rock could not open a schedule slot for this role.');
        occurrenceIdByLocation.set(add.locationId, occurrenceId);
      }
      await rockPut('/Attendances/ScheduledPersonAddConfirmed', {
        personId: add.personId,
        attendanceOccurrenceId: occurrenceId,
      });
    }

    // Read back rather than trusting the plan: Rock is the source of truth, and
    // a partially-applied write must surface as what actually happened.
    // With no occurrences the filter would be empty, and an empty `$filter` is
    // sent as-is — that fetches every Attendance in Rock, so skip the read.
    const after = occurrenceIdByLocation.size
      ? (((await rockGet('/Attendances', {
          $filter: [...occurrenceIdByLocation.values()].map((id) => `OccurrenceId eq ${id}`).join(' or '),
          $expand: 'PersonAlias/Person',
          $select:
            'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
        }, true)) || []) as any[])
      : [];

    const people = after
      .filter((a) => ROSTERED_RSVP.has(a.RSVP) && a.PersonAlias?.Person)
      .map((a) => ({
        personId: a.PersonAlias.PersonId,
        name: `${a.PersonAlias.Person.NickName || ''} ${a.PersonAlias.Person.LastName || ''}`.trim(),
      }));

    return { success: true, people };
  } catch (err) {
    console.error('Error writing Rock roster assignment:', err);
    return fail('Rock rejected the roster change. Nothing was saved.');
  }
}
