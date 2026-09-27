/** Rock's schedule category tree: ALL EVENTS (171) → campus roots → event folders. */
import type { RunsheetCampusCode } from './runsheetCampus';

export const ALL_EVENTS_CATEGORY_ID = 171;
export const SCHEDULE_CATEGORY_ENTITY_TYPE_ID = 54;
export const CAMPUS_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number> = { MNL: 305, BNE: 306, SEL: 307 };

export function descendantCategoryIds(
  categories: Array<{ id: number; parentId: number | null }>,
  rootId: number,
): number[] {
  const children = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parentId == null) continue;
    children.set(c.parentId, [...(children.get(c.parentId) || []), c.id]);
  }
  const seen = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) || []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...seen];
}

export function scheduleRootForCampus(campus: RunsheetCampusCode | null): number {
  return campus ? CAMPUS_SCHEDULE_ROOT_IDS[campus] : ALL_EVENTS_CATEGORY_ID;
}
