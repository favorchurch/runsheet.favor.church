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

  it('puts extra people beyond the slot count into the last slot', () => {
    // Rock allows several people per slot, so a third worship leader is valid.
    // They join Worship Leader 2 rather than displacing Worship Leader 1.
    expect(planRosterSlots([], [10, 20, 30], WL)).toEqual({
      adds: [
        { personId: 10, locationId: 799 },
        { personId: 20, locationId: 800 },
        { personId: 30, locationId: 800 },
      ],
      removes: [],
      error: null,
    });
  });

  it('adds a second person to a single-slot role without evicting the first', () => {
    expect(planRosterSlots([occ(1, 10, 'Stays', 475)], [10, 99], [475])).toEqual({
      adds: [{ personId: 99, locationId: 475 }],
      removes: [],
      error: null,
    });
  });

  it('leaves an existing multi-person spread exactly as Rock has it', () => {
    // Two people already share each slot; re-submitting all four touches nothing.
    const occupants = [
      occ(1, 10, 'WL1a', 799),
      occ(2, 20, 'WL1b', 799),
      occ(3, 30, 'WL2a', 800),
      occ(4, 40, 'WL2b', 800),
    ];
    expect(planRosterSlots(occupants, [10, 20, 30, 40], WL)).toEqual({
      adds: [],
      removes: [],
      error: null,
    });
  });

  it('never plans an add without a slot to put it in', () => {
    const plan = planRosterSlots([], [10, 20, 30, 40, 50], WL);
    expect(plan.error).toBeNull();
    expect(plan.adds).toHaveLength(5);
    for (const add of plan.adds) expect(WL).toContain(add.locationId);
  });

  it('rejects the same person listed twice', () => {
    const plan = planRosterSlots([], [10, 10], WL);
    expect(plan.adds).toEqual([]);
    expect(plan.error).toBe('The same person cannot be assigned to this role twice.');
  });
});
