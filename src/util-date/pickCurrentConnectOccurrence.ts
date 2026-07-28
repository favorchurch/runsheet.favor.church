export interface OccurrenceLike {
  OccurrenceDate?: string | null;
}

/**
 * From occurrences within the current connect week window, pick the one whose
 * OccurrenceDate is closest to `reference` (i.e. the current connect week's
 * meeting). On equal distance, prefer the most recent past occurrence over a
 * future one. Rows with a missing/invalid OccurrenceDate are ignored.
 *
 * Returns undefined when there is no usable occurrence.
 */
export function pickCurrentConnectOccurrence<T extends OccurrenceLike>(
  occurrences: T[],
  reference: Date
): T | undefined {
  const refTime = reference.getTime();
  let best: T | undefined;
  let bestDist = Infinity;
  let bestIsPast = false;

  for (const occurrence of occurrences) {
    if (!occurrence.OccurrenceDate) continue;
    const time = new Date(occurrence.OccurrenceDate).getTime();
    if (Number.isNaN(time)) continue;

    const dist = Math.abs(time - refTime);
    const isPast = time <= refTime;

    // Closer wins; on a tie prefer the occurrence that has already happened.
    if (dist < bestDist || (dist === bestDist && isPast && !bestIsPast)) {
      best = occurrence;
      bestDist = dist;
      bestIsPast = isPast;
    }
  }

  return best;
}
