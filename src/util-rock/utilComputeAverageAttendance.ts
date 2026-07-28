import { RockAttendance } from '../types/RockAttendance';
import { RockEventItemOccurrence } from '../types/RockEvent';

/**
 * Compute average attendance rate for a group across occurrences.
 * Replaces fluroComputeAverageAttendance.
 *
 * @param attendances - All attendance records for the group's occurrences
 * @param occurrences - The occurrences to compute across
 * @param memberCount - Total active member count for the group
 * @returns Average attendance rate (0.0 - 1.0)
 */
export function rockComputeAverageAttendance(
  attendances: RockAttendance[],
  occurrences: RockEventItemOccurrence[],
  memberCount: number
): number {
  if (!occurrences.length || memberCount <= 0) return 0;

  // Group attendances by OccurrenceId
  const attendanceByOccurrence = new Map<number, number>();
  for (const att of attendances) {
    if (att.DidAttend) {
      const count = attendanceByOccurrence.get(att.OccurrenceId) || 0;
      attendanceByOccurrence.set(att.OccurrenceId, count + 1);
    }
  }

  // Compute average rate
  let totalRate = 0;
  let occurrenceCount = 0;
  for (const occ of occurrences) {
    const attended = attendanceByOccurrence.get(occ.Id) || 0;
    totalRate += attended / memberCount;
    occurrenceCount++;
  }

  return occurrenceCount > 0 ? totalRate / occurrenceCount : 0;
}
