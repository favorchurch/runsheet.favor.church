'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  isRockLinkedCampus,
  ROCK_ROSTER_ROLES,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { mergeRosterOccupants } from '@/lib/rockRosterSlots';
import { matchRockSchedule } from '@/lib/rockServiceSchedule';
import {
  fetchRosterOccupants,
  fetchRosterScheduleMap,
} from '@/server-actions/internal/rockRosterQueries';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

export interface RosterRoleAssignment {
  roleTitle: string;
  people: { personId: number; name: string }[];
}

export interface RockRosterAssignmentsResult {
  success: boolean;
  /**
   * True when this runsheet is one Rock is supposed to roster (an MNL service).
   * `rockManaged && !linked` is the "Rock owns this runsheet but has no roster
   * for it" case — the card is hidden and no `Roster:` rows are attached.
   * `!rockManaged` is BNE/SEL, which keep the free-text card they always had.
   */
  rockManaged: boolean;
  linked: boolean;
  scheduleId: number | null;
  isoDate: string | null;
  roles: RosterRoleAssignment[];
  error?: string;
}

const UNLINKED: RockRosterAssignmentsResult = {
  success: true,
  rockManaged: true,
  linked: false,
  scheduleId: null,
  isoDate: null,
  roles: [],
};

/** A campus Rock does not roster from here at all. */
const NOT_ROCK_MANAGED: RockRosterAssignmentsResult = { ...UNLINKED, rockManaged: false };

export async function rockGetRosterAssignments(
  channelName: string,
): Promise<RockRosterAssignmentsResult> {
  if (!isRockLinkedCampus(channelName)) return NOT_ROCK_MANAGED;

  const session = await getRockSession();
  const access = assertRunsheetViewAccess(session);
  if (!access.allowed) {
    return { ...UNLINKED, success: false, error: access.error };
  }

  try {
    const { services, scheduleIdsByLocation } = await fetchRosterScheduleMap();

    const occurrence = matchRockSchedule(channelName, services);
    if (!occurrence) return UNLINKED;

    // A role Rock does not schedule for this service has no slot to read or
    // write, so it is dropped here and the card falls back to free text for it.
    const linkedRoles = ROCK_ROSTER_ROLES.map((role) => ({
      role,
      locationIds: usableRoleLocationIds(role, scheduleIdsByLocation, occurrence.scheduleId),
    })).filter((entry) => entry.locationIds.length > 0);

    if (linkedRoles.length === 0) return UNLINKED;

    const occupants = await fetchRosterOccupants({
      scheduleId: occurrence.scheduleId,
      isoDate: occurrence.isoDate,
      locationIds: linkedRoles.flatMap((entry) => entry.locationIds),
    });

    const roles = linkedRoles.map((entry) => ({
      roleTitle: entry.role.roleTitle,
      people: mergeRosterOccupants(
        // Scoped by group as well as location, exactly as the write path is
        // (`GroupId eq role.groupId`). Location ids are disjoint per role
        // today, so matching on location alone would only misattribute people
        // once Rock reuses a location across teams.
        occupants.filter((o) => o.groupId === entry.role.groupId && entry.locationIds.includes(o.locationId)),
        entry.locationIds,
      ).map((o) => ({ personId: o.personId, name: o.name })),
    }));

    return {
      success: true,
      rockManaged: true,
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
