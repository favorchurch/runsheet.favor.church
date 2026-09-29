import { describe, expect, it } from '@jest/globals';
import {
  descendantCategoryIds,
  scheduleRootForCampus,
  scheduleRootsForCategory,
  SUNDAY_SERVICES_CATEGORY_ID,
  ALL_EVENTS_CATEGORY_ID,
  YOUTH_SERVICES_CATEGORY_ID,
  CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS,
  CAMPUS_EVENT_SCHEDULE_ROOT_IDS,
  CAMPUS_YOUTH_SCHEDULE_ROOT_IDS,
  CAMPUS_KIDS_SCHEDULE_ROOT_IDS,
} from './scheduleCategoryTree';

const tree = [
  // 171 ALL EVENTS
  { id: 171, parentId: null },
  { id: 305, parentId: 171 },
  { id: 306, parentId: 171 },
  { id: 483, parentId: 305 },
  { id: 999, parentId: 483 },
  { id: 400, parentId: 306 },
  // 50 SUNDAY SERVICES
  { id: 50, parentId: null },
  { id: 302, parentId: 50 },
  { id: 303, parentId: 50 },
  { id: 304, parentId: 50 },
  { id: 417, parentId: 302 },
  { id: 416, parentId: 302 },
  // 475 YOUTH SERVICES
  { id: 475, parentId: null },
  { id: 479, parentId: 475 },
  { id: 478, parentId: 475 },
  { id: 480, parentId: 475 },
  { id: 12, parentId: null },
];

describe('descendantCategoryIds', () => {
  it('walks the whole subtree including the root', () => {
    expect(descendantCategoryIds(tree, 305).sort((a, b) => a - b)).toEqual([305, 483, 999]);
    expect(descendantCategoryIds(tree, 171)).toHaveLength(6);
  });

  it('walks Sunday services subtree from root 50 and campus roots', () => {
    expect(descendantCategoryIds(tree, 50).sort((a, b) => a - b)).toEqual([50, 302, 303, 304, 416, 417]);
    expect(descendantCategoryIds(tree, 302).sort((a, b) => a - b)).toEqual([302, 416, 417]);
    expect(descendantCategoryIds(tree, 417)).toEqual([417]);
  });

  it('walks multiple roots simultaneously', () => {
    expect(descendantCategoryIds(tree, [302, 303]).sort((a, b) => a - b)).toEqual([302, 303, 416, 417]);
  });

  it('survives a cycle', () => {
    expect(descendantCategoryIds([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }], 1).sort()).toEqual([1, 2]);
  });
});

describe('schedule category tree constants', () => {
  it('defines expected top-level category IDs', () => {
    expect(SUNDAY_SERVICES_CATEGORY_ID).toBe(50);
    expect(ALL_EVENTS_CATEGORY_ID).toBe(171);
    expect(YOUTH_SERVICES_CATEGORY_ID).toBe(475);
  });

  it('defines campus-specific root IDs for each schedule tree', () => {
    expect(CAMPUS_SUNDAY_SCHEDULE_ROOT_IDS).toEqual({ MNL: 302, BNE: 303, SEL: 304 });
    expect(CAMPUS_EVENT_SCHEDULE_ROOT_IDS).toEqual({ MNL: 305, BNE: 306, SEL: 307 });
    expect(CAMPUS_YOUTH_SCHEDULE_ROOT_IDS).toEqual({ MNL: 479, BNE: 478, SEL: 480 });
  });
});

describe('scheduleRootForCampus', () => {
  it('maps campuses to their roots and falls back to ALL EVENTS', () => {
    expect(scheduleRootForCampus('MNL')).toBe(305);
    expect(scheduleRootForCampus('BNE')).toBe(306);
    expect(scheduleRootForCampus('SEL')).toBe(307);
    expect(scheduleRootForCampus(null)).toBe(171);
  });
});

describe('scheduleRootsForCategory', () => {
  it('routes Sunday content channel categories to Sunday schedule roots (50 / 302 / 303 / 304)', () => {
    expect(scheduleRootsForCategory({ campus: 'MNL', categoryName: 'MNL | Sunday Service' })).toEqual([302]);
    expect(scheduleRootsForCategory({ campus: 'BNE', categoryName: 'BNE | Sunday Service' })).toEqual([303]);
    expect(scheduleRootsForCategory({ campus: 'SEL', categoryName: 'SEL | Sunday Service' })).toEqual([304]);
    expect(scheduleRootsForCategory({ categoryName: 'Sunday Services' })).toEqual([50]);
  });

  it('routes direct Schedule Category ID 50 (SUNDAY SERVICES) to 50 or campus subroot', () => {
    const knownScheduleCategoryIds = new Set([50, 302, 303, 304, 417, 171, 305, 475]);
    expect(scheduleRootsForCategory({ categoryId: 50, knownScheduleCategoryIds })).toEqual([50]);
    expect(scheduleRootsForCategory({ categoryId: 50, campus: 'MNL', knownScheduleCategoryIds })).toEqual([302]);
    expect(scheduleRootsForCategory({ categoryId: 417, knownScheduleCategoryIds })).toEqual([417]);
  });

  it('routes Youth content channel categories to Youth schedule roots (475 / 479 / 478 / 480)', () => {
    expect(scheduleRootsForCategory({ campus: 'MNL', categoryName: 'MNL | Youth Service' })).toEqual([479]);
    expect(scheduleRootsForCategory({ campus: 'BNE', categoryName: 'BNE | Youth Service' })).toEqual([478]);
    expect(scheduleRootsForCategory({ categoryName: 'Youth Services' })).toEqual([475]);
  });

  it('routes Kids content channel categories to Kids schedule roots (470 / 472 / 471 / 473)', () => {
    expect(scheduleRootsForCategory({ campus: 'MNL', categoryName: 'MNL | Kids Service', categoryId: 586 })).toEqual([472]);
    expect(scheduleRootsForCategory({ campus: 'BNE', categoryName: 'BNE | Kids Service', categoryId: 587 })).toEqual([471]);
    expect(scheduleRootsForCategory({ campus: 'SEL', categoryName: 'SEL | Kids Service', categoryId: 588 })).toEqual([473]);
    expect(scheduleRootsForCategory({ categoryName: 'Kids Services' })).toEqual([470]);
    expect(CAMPUS_KIDS_SCHEDULE_ROOT_IDS).toEqual({ MNL: 472, BNE: 471, SEL: 473 });
  });

  it('routes each campus ALL EVENTS category to its Event schedule root', () => {
    expect(scheduleRootsForCategory({ campus: 'MNL', categoryName: 'MNL | ALL EVENTS', categoryId: 590 })).toEqual([305]);
    expect(scheduleRootsForCategory({ campus: 'BNE', categoryName: 'BNE | ALL EVENTS', categoryId: 591 })).toEqual([306]);
    expect(scheduleRootsForCategory({ campus: 'SEL', categoryName: 'SEL | ALL EVENTS', categoryId: 592 })).toEqual([307]);
  });

  it('routes generic Event content channel categories to Event schedule roots (171 / 305 / 306 / 307)', () => {
    expect(scheduleRootsForCategory({ campus: 'MNL', categoryName: 'MNL | Family Night', categoryId: 337 })).toEqual([305]);
    expect(scheduleRootsForCategory({ campus: 'BNE', categoryName: 'BNE | Movement Night', categoryId: 340 })).toEqual([306]);
    expect(scheduleRootsForCategory({ categoryName: 'Conferences', categoryId: 999 })).toEqual([171]);
  });

  it('falls back to all roots when neither category nor name is provided', () => {
    expect(scheduleRootsForCategory({})).toEqual([50, 171, 475]);
    expect(scheduleRootsForCategory({ campus: 'MNL' })).toEqual([302, 305, 479]);
  });
});
