import { describe, expect, it } from '@jest/globals';
import { mergeRosterOccupants, planRosterSlots } from './rockRosterSlots';

const WL = [799, 800];
const occ = (attendanceId: number, personId: number, name: string, locationId: number) => ({
  attendanceId, personId, name, locationId,
});

describe('mergeRosterOccupants', () => {
  it('orders occupants by slot order, not by arrival order', () => {
    const merged = mergeRosterOccupants(
      [occ(2, 20, 'Second Slot', 800), occ(1, 10, 'First Slot', 799)],
      WL,
    );
    expect(merged.map((o) => o.name)).toEqual(['First Slot', 'Second Slot']);
  });

  it('skips occupants in unmapped locations', () => {
    const merged = mergeRosterOccupants([occ(3, 30, 'Stray', 555)], WL);
    expect(merged).toEqual([]);
  });

  it('handles a half-filled multi-slot role', () => {
    expect(mergeRosterOccupants([occ(2, 20, 'Only One', 800)], WL).map((o) => o.name)).toEqual([
      'Only One',
    ]);
  });
});

describe('planRosterSlots', () => {
  it('adds a person into the first free slot', () => {
    expect(planRosterSlots([], [10], WL)).toEqual({
      adds: [{ personId: 10, locationId: 799 }],
      removes: [],
      error: null,
    });
  });

  it('leaves an unchanged person completely alone', () => {
    expect(planRosterSlots([occ(1, 10, 'Stays', 799)], [10], WL)).toEqual({
      adds: [],
      removes: [],
      error: null,
    });
  });

  it('removes a person dropped from the cell', () => {
    expect(planRosterSlots([occ(1, 10, 'Goes', 799)], [], WL)).toEqual({
      adds: [],
      removes: [1],
      error: null,
    });
  });

  it('fills the second slot without disturbing the first', () => {
    expect(planRosterSlots([occ(1, 10, 'Stays', 799)], [10, 20], WL)).toEqual({
      adds: [{ personId: 20, locationId: 800 }],
      removes: [],
      error: null,
    });
  });

  it('swaps one person for another in a single-slot role', () => {
    expect(planRosterSlots([occ(1, 10, 'Out', 475)], [99], [475])).toEqual({
      adds: [{ personId: 99, locationId: 475 }],
      removes: [1],
      error: null,
    });
  });

  it('rejects more names than the role has slots and plans nothing', () => {
    const plan = planRosterSlots([], [10, 20, 30], WL);
    expect(plan.adds).toEqual([]);
    expect(plan.removes).toEqual([]);
    expect(plan.error).toBe('Rock only has 2 slots for this role, but 3 people were assigned.');
  });

  it('rejects the same person listed twice', () => {
    const plan = planRosterSlots([], [10, 10], WL);
    expect(plan.adds).toEqual([]);
    expect(plan.error).toBe('The same person cannot be assigned to this role twice.');
  });
});
