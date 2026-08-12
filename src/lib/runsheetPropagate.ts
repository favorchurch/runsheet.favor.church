/**
 * Builds a review-ready propagation plan from a set of candidate cell
 * changes and the row matches for each target sibling. Every real edit shows
 * up here regardless of which column it's on — the only thing filtered out
 * is `SIBLINGKEY` itself, an internal bookkeeping attribute never surfaced
 * as an editable cell in the first place.
 */
import { SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import type { MatchResult } from '@/lib/runsheetMatch';
import type { SiblingChannel } from '@/lib/runsheetSiblings';
import type { DynamicAttributeColumn } from '@/types/Runsheet';

export interface CandidateCellChange {
  /** The source row's own id — the stable identity used for matching, since `itemTitle` can itself be one of the edited columns. */
  itemId: number;
  itemTitle: string;
  columnKey: string;
  columnName: string;
  newValue: string;
  previousValue: string;
}

export type CellStatus = 'clean' | 'diverged' | 'unmatched';

export interface CellChange {
  itemTitle: string;
  columnKey: string;
  columnName: string;
  newValue: string;
  sourcePreviousValue: string;
  targetCurrentValue: string | null;
  /** The matched row's own id in the target sheet, used to locate it at execute time — title text is display-only and may not match (e.g. a rename hasn't landed on the target yet). */
  targetItemId: number | null;
  status: CellStatus;
  selected: boolean;
}

export interface PropagationTarget {
  channel: SiblingChannel;
  changes: CellChange[];
}

export interface PropagationPlan {
  targets: PropagationTarget[];
}

function isExcludedColumn(columnKey: string): boolean {
  return columnKey === SIBLINGKEY_ATTRIBUTE_KEY;
}

export function buildPropagationPlan(
  candidateChanges: CandidateCellChange[],
  matchResultsByChannel: Map<number, MatchResult>,
  targets: SiblingChannel[],
  // Kept for call-site compatibility; no longer used to exclude columns —
  // every real edit is shown, regardless of its column.
  _columns: DynamicAttributeColumn[],
): PropagationPlan {
  const eligibleChanges = candidateChanges.filter((c) => !isExcludedColumn(c.columnKey));

  const planTargets: PropagationTarget[] = targets.map((channel) => {
    const matchResult = matchResultsByChannel.get(channel.channelId);
    const changes: CellChange[] = [];

    for (const candidate of eligibleChanges) {
      // Matched by id, not title text — the title itself may be one of the
      // columns that just changed, so it can't double as the join key.
      const rowMatch = matchResult?.matches.find((m) => m.sourceRow.id === candidate.itemId);

      if (!rowMatch || !rowMatch.targetRow) {
        changes.push({
          itemTitle: candidate.itemTitle,
          columnKey: candidate.columnKey,
          columnName: candidate.columnName,
          newValue: candidate.newValue,
          sourcePreviousValue: candidate.previousValue,
          targetCurrentValue: null,
          targetItemId: null,
          status: 'unmatched',
          selected: false,
        });
        continue;
      }

      const targetCurrentValue = rowMatch.targetRow.attributeValues?.[candidate.columnKey] ?? '';
      const isClean = targetCurrentValue === candidate.previousValue;

      changes.push({
        itemTitle: candidate.itemTitle,
        columnKey: candidate.columnKey,
        columnName: candidate.columnName,
        newValue: candidate.newValue,
        sourcePreviousValue: candidate.previousValue,
        targetCurrentValue,
        targetItemId: typeof rowMatch.targetRow.id === 'number' ? rowMatch.targetRow.id : null,
        status: isClean ? 'clean' : 'diverged',
        selected: isClean,
      });
    }

    return { channel, changes };
  });

  return { targets: planTargets };
}
