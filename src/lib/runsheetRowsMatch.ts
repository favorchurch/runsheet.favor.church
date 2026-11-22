import type { RunsheetItemRow } from '@/types/Runsheet';

/** Roster placeholders are mirrored from Rock's Group Scheduler, not edited as runsheet content. */
function isRosterRow(row: RunsheetItemRow): boolean {
  return typeof row.title === 'string' && row.title.startsWith('Roster:');
}

function rowTitle(row: RunsheetItemRow): string {
  return row.attributeValues?.ACTIVITYTITLE || row.title || '';
}

function sameAttributeValues(a: RunsheetItemRow, b: RunsheetItemRow): boolean {
  const left = a.attributeValues || {};
  const right = b.attributeValues || {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    // The title is compared separately, with its `title` fallback.
    if (key === 'ACTIVITYTITLE') continue;
    if ((left[key] ?? '') !== (right[key] ?? '')) return false;
  }
  return true;
}

/**
 * True when the rows on screen carry the same content, in the same order, as the
 * rows Rock returned.
 *
 * The editor decides what to save by diffing its rows against a baseline built
 * from Rock's rows. If a refetch replaces that baseline while the rows on screen
 * are older, every stale row reads as a user edit and the next save writes it
 * back over newer content. This is how the editor tells "nothing to do" from
 * "the screen is behind Rock".
 *
 * Deliberately ignored:
 * - `Roster:` rows, because the editor overwrites their values from Rock's
 *   roster, so they never match the stored copy;
 * - `startDateTime` and `order`, which are derived from row position and
 *   duration (position itself is compared through the id sequence).
 */
export function runsheetRowsMatch(onScreen: RunsheetItemRow[], fromRock: RunsheetItemRow[]): boolean {
  const left = onScreen.filter((row) => !isRosterRow(row));
  const right = fromRock.filter((row) => !isRosterRow(row));
  if (left.length !== right.length) return false;

  return left.every((row, index) => {
    const other = right[index];
    return (
      row.id === other.id &&
      rowTitle(row) === rowTitle(other) &&
      (row.duration || 0) === (other.duration || 0) &&
      (row.songItemId ?? null) === (other.songItemId ?? null) &&
      sameAttributeValues(row, other)
    );
  });
}
