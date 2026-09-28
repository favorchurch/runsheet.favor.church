/**
 * Maps the runsheet's vital roster roles onto Rock Group Scheduler.
 *
 * In Group Scheduler a *role* is a `Location` attached to the team `Group`, so a
 * role maps to one groupId plus one or more locationIds. Multi-slot roles
 * (Worship Leaders, Offstage Director) merge into one runsheet cell for display
 * and fill their slots positionally on write.
 *
 * Verified against production Rock on 2026-09-28. MNL only by decision; adding a
 * campus is adding rows here, not changing code.
 */
import { extractRunsheetCampus } from './runsheetCampus';

export interface RockRosterRole {
  /** Full runsheet item title, e.g. `Roster: Service Director`. */
  roleTitle: string;
  groupId: number;
  /** Rock Location ids, in the order names fill them. */
  locationIds: number[];
}

export const ROCK_ROSTER_ROLES: readonly RockRosterRole[] = [
  { roleTitle: 'Roster: Service Director', groupId: 19100, locationIds: [475] },
  { roleTitle: 'Roster: Service Producer', groupId: 19109, locationIds: [661] },
  { roleTitle: 'Roster: Assistant Service Producers', groupId: 19109, locationIds: [662] },
  { roleTitle: 'Roster: Stage Manager Captain', groupId: 19100, locationIds: [479] },
  { roleTitle: 'Roster: Assistant Stage Managers', groupId: 19100, locationIds: [480] },
  { roleTitle: 'Roster: Music Director', groupId: 19095, locationIds: [794] },
  { roleTitle: 'Roster: Offstage Director', groupId: 19095, locationIds: [498, 499] },
  { roleTitle: 'Roster: Worship Leaders', groupId: 19095, locationIds: [799, 800] },
  { roleTitle: 'Roster: Host Core Cap', groupId: 19096, locationIds: [524] },
  { roleTitle: 'Roster: Security Lead', groupId: 19144, locationIds: [748] },
] as const;

export const ROCK_ROSTER_GROUP_IDS: readonly number[] = [
  ...new Set(ROCK_ROSTER_ROLES.map((r) => r.groupId)),
];

export function getRockRosterRole(roleTitle: string): RockRosterRole | null {
  return ROCK_ROSTER_ROLES.find((r) => r.roleTitle === roleTitle) ?? null;
}

/** Rock-linked rostering is MNL-only for now. */
export function isRockLinkedCampus(channelName: string): boolean {
  return extractRunsheetCampus(channelName) === 'MNL';
}

/**
 * The slots this role actually has for one service, in fill order.
 *
 * Not every team schedules every service: group 19096 (Host) and 19144
 * (Security) carry no `MNL Family Night` schedule, so on that runsheet those
 * roles have no slot at all. An empty result means the role is **unlinked** for
 * this service and must behave exactly as it did before this feature — free
 * text, stored value, no write-back.
 *
 * @param scheduleIdsByLocation Rock `Location` id → the Schedule ids attached to it.
 */
export function usableRoleLocationIds(
  role: RockRosterRole,
  scheduleIdsByLocation: Map<number, Set<number>>,
  scheduleId: number,
): number[] {
  return role.locationIds.filter((id) => scheduleIdsByLocation.get(id)?.has(scheduleId));
}
