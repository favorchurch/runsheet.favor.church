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
  if (desiredPersonIds.length > locationIds.length) {
    return {
      ...empty,
      error: `Rock only has ${locationIds.length} slot${
        locationIds.length === 1 ? '' : 's'
      } for this role, but ${desiredPersonIds.length} people were assigned.`,
    };
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

  const adds = desiredPersonIds
    .filter((id) => !keptPersonIds.has(id))
    .map((personId, index) => ({ personId, locationId: freeSlots[index] }));

  return { adds, removes, error: null };
}
