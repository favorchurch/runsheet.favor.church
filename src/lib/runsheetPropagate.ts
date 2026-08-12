/**
 * Builds a review-ready propagation plan from a set of candidate cell
 * changes and the row matches for each target sibling. Person and platform
 * columns are filtered before the plan exists, not at render time, so an
 * excluded column can never reach either surface that consumes this plan.
 */
import { isPersonColumn, SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import type { MatchResult } from '@/lib/runsheetMatch';
import type { SiblingChannel } from '@/lib/runsheetSiblings';
import type { DynamicAttributeColumn } from '@/types/Runsheet';

export interface CandidateCellChange {
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

const PLATFORM_COLUMN_KEYS = [
  'ANCHORPREACHER',
  'MAININSTRUMENT',
  'LEDLIVESCREENS',
  'LED WALL',
  'OVERLAYBROADCAST',
  'LIGHTING',
  'AUDIO',
];

function isExcludedColumn(columnKey: string, columns: DynamicAttributeColumn[]): boolean {
  if (columnKey === SIBLINGKEY_ATTRIBUTE_KEY) return true;
  if (PLATFORM_COLUMN_KEYS.includes(columnKey.toUpperCase())) return true;

  const column = columns.find((c) => c.key === columnKey);
  return !!column && isPersonColumn(column);
}

export function buildPropagationPlan(
  candidateChanges: CandidateCellChange[],
  matchResultsByChannel: Map<number, MatchResult>,
  targets: SiblingChannel[],
  columns: DynamicAttributeColumn[],
): PropagationPlan {
  const eligibleChanges = candidateChanges.filter((c) => !isExcludedColumn(c.columnKey, columns));

  const planTargets: PropagationTarget[] = targets.map((channel) => {
    const matchResult = matchResultsByChannel.get(channel.channelId);
    const changes: CellChange[] = [];

    for (const candidate of eligibleChanges) {
      const rowMatch = matchResult?.matches.find(
        (m) => (m.sourceRow.attributeValues?.ACTIVITYTITLE || m.sourceRow.title) === candidate.itemTitle,
      );

      if (!rowMatch || !rowMatch.targetRow) {
        changes.push({
          itemTitle: candidate.itemTitle,
          columnKey: candidate.columnKey,
          columnName: candidate.columnName,
          newValue: candidate.newValue,
          sourcePreviousValue: candidate.previousValue,
          targetCurrentValue: null,
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
        status: isClean ? 'clean' : 'diverged',
        selected: isClean,
      });
    }

    return { channel, changes };
  });

  return { targets: planTargets };
}
