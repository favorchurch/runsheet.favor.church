'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { batchODataFilter } from '@/server-actions/internal/batchODataFilter';
import { rockGetAncestorLeadersByGroupId } from '@/server-actions/rockGetAncestorLeaders';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { ConnectRole } from '@/types/ConnectRole';
import { RockAttendance } from '@/types/RockAttendance';
import { RockGuestlistItem } from '@/types/RockGuestlist';
import { RockGroupMember, RockGroupMemberStatus, RockGroupRoleId } from '@/types/RockGroupMember';
import { RockPerson } from '@/types/RockPerson';
import { boolean, number, object } from 'zod';

interface RockPersonAliasLookup {
  Id: number;
  PersonId?: number | null;
}

const schema = object({
  occurrenceId: number().int().positive(),
  includeLeaders: boolean().optional(),
});

/**
 * Map Rock GroupRoleId to ConnectRole.
 */
function getRoleFromGroupRoleId(roleId: number): ConnectRole | null {
  switch (roleId) {
    case RockGroupRoleId.ConnectGroupLeader:
      return ConnectRole.ConnectLeader;
    case RockGroupRoleId.ConnectGroupRegionalLeader:
      return ConnectRole.RegionalLeader;
    case RockGroupRoleId.ConnectGroupClusterHead:
      return ConnectRole.ClusterHead;
    default:
      return null;
  }
}

/**
 * Get guestlist for an event occurrence.
 * Replaces fluroGetEventGuestlistById.
 *
 * Merges:
 * 1. Group members (expected guests)
 * 2. Attendance records (checked-in guests)
 * 3. Role mappings from GroupMember.GroupRoleId
 */
export async function rockGetEventGuestlistById(
  occurrenceId: number,
  includeLeaders?: boolean
): Promise<RockGuestlistItem[]> {
  await assertAuthenticated();
  schema.parse({ occurrenceId, includeLeaders });

  // Step 1: Get the occurrence to find the linked GroupId
  const occurrence = await rockGet(`/AttendanceOccurrences/${occurrenceId}`, {
    $select: 'Id,GroupId',
  });

  const occurrenceGroupId = occurrence?.GroupId;

  // Step 2: Get attendance records keyed by PersonAliasId.
  const attendances: RockAttendance[] = await rockGet('/Attendances', {
    $filter: `OccurrenceId eq ${occurrenceId}`,
    $select: 'Id,PersonAliasId,DidAttend',
    $top: 500,
  });

  const personAliasIds = Array.from(
    new Set(attendances.map((a) => a.PersonAliasId).filter((id): id is number => !!id))
  );
  const personAliases =
    personAliasIds.length > 0
      ? await batchODataFilter<RockPersonAliasLookup>(personAliasIds, 'Id', (filter) =>
          rockGet('/PersonAlias', {
            $filter: filter,
            $select: 'Id,PersonId',
            $top: 500,
          })
        )
      : [];
  const personAliasMap = new Map(personAliases.map((alias) => [alias.Id, alias.PersonId]));

  const personIds = Array.from(
    new Set(personAliases.map((alias) => alias.PersonId).filter((id): id is number => !!id))
  );
  const people =
    personIds.length > 0
      ? await batchODataFilter<RockPerson>(personIds, 'Id', (filter) => rockGet('/People', { $filter: filter }))
      : [];
  const personMap = new Map(people.map((p) => [p.Id, p]));

  // Step 3: Get group members (expected)
  let members: RockGroupMember[] = [];
  if (occurrenceGroupId) {
    members = await rockGet('/GroupMembers', {
      $filter: `GroupId eq ${occurrenceGroupId}`,
      $expand: 'Person,GroupRole',
      $top: 500,
    });
  }

  const groupIds = occurrenceGroupId ? [occurrenceGroupId] : [];
  const ancestorLeaders =
    includeLeaders && groupIds.length > 0 ? await rockGetAncestorLeadersByGroupId(groupIds) : [];

  // Build guestlist from members (expected)
  const guestMap = new Map<number, RockGuestlistItem>();
  const memberPersonIds = new Set<number>();

  for (const member of members) {
    if (member.GroupMemberStatus !== RockGroupMemberStatus.Active || !member.Person) continue;
    const personId = member.PersonId;
    memberPersonIds.add(personId);

    const role = getRoleFromGroupRoleId(member.GroupRoleId);
    const existing = guestMap.get(personId);

    if (existing) {
      if (role && !existing.roles?.includes(role)) {
        existing.roles = [...(existing.roles || []), role];
      }
    } else {
      guestMap.set(personId, {
        ...member.Person,
        attendance: { guestExpected: true },
        roles: role ? [role] : undefined,
        groupMemberId: member.Id,
        groupRoleName: member.GroupRole?.Name,
      });
    }
  }

  for (const leader of ancestorLeaders) {
    if (!leader.Id) continue;
    const existing = guestMap.get(leader.Id);
    if (existing) {
      const roles = new Set([...(existing.roles || []), ...(leader.roles || [])]);
      existing.roles = Array.from(roles);
    } else {
      guestMap.set(leader.Id, leader);
    }
  }

  // Merge attendance records
  for (const att of attendances) {
    const personId = personAliasMap.get(att.PersonAliasId);
    const person = personId ? personMap.get(personId) : undefined;
    if (!person || !personId) continue;

    const existing = guestMap.get(personId);
    if (existing) {
      existing.attendance = {
        ...existing.attendance,
        checkin: att.DidAttend ?? true,
      };
      existing.attendanceId = att.Id;
    } else {
      // Checked in but not a group member
      guestMap.set(personId, {
        ...person,
        attendance: {
          checkin: att.DidAttend ?? true,
          guestExpected: false,
        },
        attendanceId: att.Id,
      });
    }
  }

  // Mark removed: expected but not checked in and not in members list
  const result = Array.from(guestMap.values());
  for (const guest of result) {
    if (
      guest.attendance?.guestExpected &&
      !guest.attendance?.checkin &&
      guest.Id &&
      !memberPersonIds.has(guest.Id)
    ) {
      guest.attendance = { ...guest.attendance, removed: true };
    }
  }

  return result;
}
