import { describe, expect, it } from '@jest/globals';
import { descendantCategoryIds, scheduleRootForCampus } from './scheduleCategoryTree';

const tree = [
  { id: 171, parentId: null },
  { id: 305, parentId: 171 },
  { id: 306, parentId: 171 },
  { id: 483, parentId: 305 },
  { id: 999, parentId: 483 },
  { id: 400, parentId: 306 },
  { id: 12, parentId: null },
];

describe('descendantCategoryIds', () => {
  it('walks the whole subtree including the root', () => {
    expect(descendantCategoryIds(tree, 305).sort((a, b) => a - b)).toEqual([305, 483, 999]);
    expect(descendantCategoryIds(tree, 171)).toHaveLength(6);
  });

  it('survives a cycle', () => {
    expect(descendantCategoryIds([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }], 1).sort()).toEqual([1, 2]);
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
