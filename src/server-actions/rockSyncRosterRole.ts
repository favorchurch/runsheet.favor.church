'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import {
  getRockRosterRole,
  isRockLinkedCampus,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { planRosterSlots } from '@/lib/rockRosterSlots';
import { matchRockSchedule } from '@/lib/rockServiceSchedule';
import { extractChannelDate } from '@/lib/runsheetDate';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';
import {
  fetchRosterOccupants,
  fetchRosterScheduleMap,
} from '@/server-actions/internal/rockRosterQueries';

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
    // Same cached map the read uses, so the two always agree on which team
    // runs which service.
    const { services, scheduleIdsByLocation } = await fetchRosterScheduleMap();

    const occurrence = matchRockSchedule(channelName, services);
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

    // Same shared reader the card uses, so the two can never disagree about who
    // is currently in the role (or about Rock's RSVP encoding).
    const occupants = (
      await fetchRosterOccupants({
        scheduleId: occurrence.scheduleId,
        isoDate: occurrence.isoDate,
        locationIds: usableLocationIds,
      })
    ).filter((o) => o.groupId === role.groupId);

    const occurrenceIdByLocation = new Map<number, number>(
      (
        ((await rockGet(
          '/AttendanceOccurrences',
          {
            $filter: [
              `ScheduleId eq ${occurrence.scheduleId}`,
              `OccurrenceDate eq datetime'${occurrence.isoDate}T00:00:00'`,
              `GroupId eq ${role.groupId}`,
              `(${usableLocationIds.map((id) => `LocationId eq ${id}`).join(' or ')})`,
            ].join(' and '),
            $select: 'Id,LocationId',
          },
          true,
        )) || []) as any[]
      ).map((o) => [o.LocationId, o.Id]),
    );

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
    const people = (
      await fetchRosterOccupants({
        scheduleId: occurrence.scheduleId,
        isoDate: occurrence.isoDate,
        locationIds: usableLocationIds,
      })
    )
      .filter((o) => o.groupId === role.groupId)
      .map((o) => ({ personId: o.personId, name: o.name }));

    return { success: true, people };
  } catch (err) {
    console.error('Error writing Rock roster assignment:', err);
    return fail('Rock rejected the roster change. Nothing was saved.');
  }
}
