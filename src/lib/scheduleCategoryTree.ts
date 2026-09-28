/**
 * Rock's schedule category trees (EntityTypeId 54):
 *
 * 1. SUNDAY SERVICES (Category 50)
 *    ├── 🇵🇭 Manila (302)
 *    │   ├── Podium (416)
 *    │   ├── Crowne (417)
 *    │   ├── Metrotent (418)
 *    │   └── ...
 *    ├── 🇦🇺 Brisbane (303)
 *    └── 🇰🇷 Seoul (304)
 *
 * 2. ALL EVENTS (Category 171)
 *    ├── 🇵🇭 Manila (305)
 *    │   ├── Recurring Events (314)
 *    │   ├── One-off Events (481)
 *    │   ├── Grow Courses (483)
 *    │   └── ...
 *    ├── 🇦🇺 Brisbane (306)
 *    └── 🇰🇷 Seoul (307)
 *
 * 3. YOUTH SERVICES (Category 475)
 *    ├── 🇵🇭 Manila (479)
 *    ├── 🇦🇺 Brisbane (478)
 *    └── 🇰🇷 Seoul (480)
 */
import type { RunsheetCampusCode } from './runsheetCampus';

export const SUNDAY_SERVICES_CATEGORY_ID = 50;
export const ALL_EVENTS_CATEGORY_ID = 171;
export const YOUTH_SERVICES_CATEGORY_ID = 475;
export const SCHEDULE_CATEGORY_ENTITY_TYPE_ID = 54;

export const CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number> = {
  MNL: 302,
  BNE: 303,
  SEL: 304,
};

export const CAMPUS_EVENT_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number> = {
  MNL: 305,
  BNE: 306,
  SEL: 307,
};

export const CAMPUS_YOUTH_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number> = {
  MNL: 479,
  BNE: 478,
  SEL: 480,
};

/** Backward compatibility alias for event schedule roots */
export const CAMPUS_SCHEDULE_ROOT_IDS = CAMPUS_EVENT_SCHEDULE_ROOT_IDS;

export function descendantCategoryIds(
  categories: Array<{ id: number; parentId: number | null }>,
  rootIds: number | number[],
): number[] {
  const children = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parentId == null) continue;
    children.set(c.parentId, [...(children.get(c.parentId) || []), c.id]);
  }
  const roots = Array.isArray(rootIds) ? rootIds : [rootIds];
  const seen = new Set<number>(roots);
  const queue = [...roots];
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

export function isSundayCategoryName(name?: string | null): boolean {
  return /sunday/i.test(name || '');
}

export function isYouthCategoryName(name?: string | null): boolean {
  return /youth/i.test(name || '');
}

export function scheduleRootsForCategory({
  campus,
  categoryName,
  categoryId,
  knownScheduleCategoryIds,
}: {
  campus?: RunsheetCampusCode | null;
  categoryName?: string | null;
  categoryId?: number | null;
  knownScheduleCategoryIds?: Set<number>;
}): number[] {
  // If the categoryId is explicitly a Schedule Category (entityTypeId 54),
  // e.g. CategoryId=50 or CategoryId=302 or CategoryId=417:
  if (categoryId != null && knownScheduleCategoryIds?.has(categoryId)) {
    if (categoryId === SUNDAY_SERVICES_CATEGORY_ID && campus) {
      return [CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS[campus]];
    }
    if (categoryId === ALL_EVENTS_CATEGORY_ID && campus) {
      return [CAMPUS_EVENT_SCHEDULE_ROOT_IDS[campus]];
    }
    if (categoryId === YOUTH_SERVICES_CATEGORY_ID && campus) {
      return [CAMPUS_YOUTH_SCHEDULE_ROOT_IDS[campus]];
    }
    return [categoryId];
  }

  // Youth is tested first: it is the narrower label, and both tests are bare
  // substring matches. A category such as "MNL | Sunday Youth" would otherwise
  // resolve to the Sunday tree and then be filtered down to nothing, leaving
  // the picker empty.
  // (e.g. "MNL | Youth Service", "YOUTH SERVICES", or categoryId 475)
  if (isYouthCategoryName(categoryName) || categoryId === YOUTH_SERVICES_CATEGORY_ID) {
    return [campus ? CAMPUS_YOUTH_SCHEDULE_ROOT_IDS[campus] : YOUTH_SERVICES_CATEGORY_ID];
  }

  // If name indicates Sunday Service (e.g. "MNL | Sunday Service", "SUNDAY SERVICES", or categoryId 50)
  if (isSundayCategoryName(categoryName) || categoryId === SUNDAY_SERVICES_CATEGORY_ID) {
    return [campus ? CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS[campus] : SUNDAY_SERVICES_CATEGORY_ID];
  }

  // If categoryId was passed but not Sunday or Youth, it's an event (e.g. Family Night, Movement Night)
  if (categoryId != null) {
    return [campus ? CAMPUS_EVENT_SCHEDULE_ROOT_IDS[campus] : ALL_EVENTS_CATEGORY_ID];
  }

  // If nothing is specified (e.g. empty rockGetScheduleOptions call), include all schedule trees:
  if (campus) {
    return [
      CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS[campus],
      CAMPUS_EVENT_SCHEDULE_ROOT_IDS[campus],
      CAMPUS_YOUTH_SCHEDULE_ROOT_IDS[campus],
    ];
  }
  return [SUNDAY_SERVICES_CATEGORY_ID, ALL_EVENTS_CATEGORY_ID, YOUTH_SERVICES_CATEGORY_ID];
}

export function scheduleRootForCampus(campus: RunsheetCampusCode | null): number {
  return campus ? CAMPUS_SCHEDULE_ROOT_IDS[campus] : ALL_EVENTS_CATEGORY_ID;
}
