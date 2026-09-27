/** Pure Grow Course access rules; Rock fetching lives in rockResolveAccess. */
import { GROW_EDITOR_ROLE_NAMES, GROW_TEAM_GROUP_ID, growOccurrenceKey } from './growRunsheets';

export interface GrowAccessInput {
  memberships: Array<{ groupId: number; groupRoleId?: number }>;
  roleNamesById: ReadonlyMap<number, string>;
  rostered: Array<{ scheduleId: number; occurrenceDate: string }>;
  growScheduleIds: ReadonlySet<number>;
}

export function resolveGrowAccess(input: GrowAccessInput): { growEditor: boolean; growViewer: string[] } {
  const growEditor = input.memberships.some(
    (m) =>
      m.groupId === GROW_TEAM_GROUP_ID &&
      GROW_EDITOR_ROLE_NAMES.includes((input.roleNamesById.get(Number(m.groupRoleId)) || '').trim().toLowerCase()),
  );

  const growViewer = [
    ...new Set(
      input.rostered
        .filter((r) => input.growScheduleIds.has(r.scheduleId))
        .map((r) => growOccurrenceKey(r.scheduleId, r.occurrenceDate.slice(0, 10))),
    ),
  ];

  return { growEditor, growViewer };
}
