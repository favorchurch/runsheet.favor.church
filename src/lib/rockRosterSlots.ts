/**
 * Diffs a role's current Rock occupants against the people the runsheet now
 * wants in it.
 *
 * A role owns an ordered list of Rock Locations ("slots"). Names fill slots
 * positionally. Someone present before and after an edit keeps their existing
 * assignment and its RSVP state — an unrelated edit to the same cell must never
 * churn a confirmed volunteer into a fresh record.
 */

export interface RosterOccupant {
  attendanceId: number;
  personId: number;
  name: string;
  locationId: number;
}

export interface RosterSlotPlan {
  adds: { personId: number; locationId: number }[];
  /** Attendance ids to unschedule. */
  removes: number[];
  /** Non-null means the whole write is rejected and nothing is applied. */
  error: string | null;
}

/** Display order: by slot position, stable within a slot. */
export function mergeRosterOccupants(
  occupants: RosterOccupant[],
  locationIds: number[],
): RosterOccupant[] {
  return occupants
    .filter((o) => locationIds.includes(o.locationId))
    .map((o, index) => ({ o, index }))
    .sort((a, b) => {
      const slot = locationIds.indexOf(a.o.locationId) - locationIds.indexOf(b.o.locationId);
      return slot !== 0 ? slot : a.index - b.index;
    })
    .map((entry) => entry.o);
}

export function planRosterSlots(
  occupants: RosterOccupant[],
  desiredPersonIds: number[],
  locationIds: number[],
): RosterSlotPlan {
  const empty: RosterSlotPlan = { adds: [], removes: [], error: null };

  if (new Set(desiredPersonIds).size !== desiredPersonIds.length) {
    return { ...empty, error: 'The same person cannot be assigned to this role twice.' };
  }
  const current = mergeRosterOccupants(occupants, locationIds);
  const keptPersonIds = new Set(
    desiredPersonIds.filter((id) => current.some((o) => o.personId === id)),
  );

  const removes = current.filter((o) => !keptPersonIds.has(o.personId)).map((o) => o.attendanceId);

  // Slots held by someone who is staying are not available to newcomers.
  const takenSlots = new Set(
    current.filter((o) => keptPersonIds.has(o.personId)).map((o) => o.locationId),
  );
  const freeSlots = locationIds.filter((id) => !takenSlots.has(id));

  // Rock lets several people share one slot — production already has two people
  // in each of the two Worship Leader slots — so more names than slots is valid,
  // not an error. Newcomers take the empty slots in order, and once every slot
  // is spoken for the rest join the last one: a third worship leader belongs
  // alongside Worship Leader 2, never promoted into Worship Leader 1, and a
  // third offstage name joins the Shadow rather than becoming the Director.
  // People already in the role are untouched, so an existing spread across slots
  // is preserved exactly as Rock has it.
  const overflowSlot = locationIds[locationIds.length - 1];

  const adds = desiredPersonIds
    .filter((id) => !keptPersonIds.has(id))
    .map((personId, index) => ({ personId, locationId: freeSlots[index] ?? overflowSlot }));

  return { adds, removes, error: null };
}
