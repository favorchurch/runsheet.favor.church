import { readRunsheetCellValue } from '@/constants/runsheetColumns';
import { extractCellUrl, htmlToPlainText } from '@/lib/richText';
import { matchRows } from '@/lib/runsheetMatch';
import {
  formatDurationToHMS,
  formatMinutesToTimeWithSeconds,
  parseTimeToMinutes,
} from '@/lib/runsheetTime';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

export type InlineDiffCellStatus = 'same' | 'changed' | 'removed' | 'added';
export type InlineDiffRowStatus = 'matched' | 'source-only' | 'target-only';

export interface InlineDiffCell {
  status: InlineDiffCellStatus;
  sourceValue: string;
  targetValue: string;
}

export interface InlineDiffRow {
  key: string;
  rowStatus: InlineDiffRowStatus;
  sourceRow: RunsheetItemRow | null;
  targetRow: RunsheetItemRow | null;
  sourceIndex: number | null;
  targetIndex: number | null;
  cells: Record<string, InlineDiffCell>;
}

export interface BuildInlineDiffRowsInput {
  sourceRows: RunsheetItemRow[];
  targetRows: RunsheetItemRow[];
  targetChannelId: number;
  columns: DynamicAttributeColumn[];
  sourceStartTime: string;
  targetStartTime: string;
}

function visibleRows(rows: RunsheetItemRow[]): RunsheetItemRow[] {
  return rows.filter((row) => !(row.title && row.title.startsWith('Roster:')));
}

function rowIdentity(row: RunsheetItemRow): string {
  return `${typeof row.id}:${String(row.id)}`;
}

function titleValue(row: RunsheetItemRow): string {
  return row.attributeValues?.ACTIVITYTITLE || row.title || '';
}

type TimingEntry = { start: string; end: string; duration: string };

function buildTimingMap(rows: RunsheetItemRow[], startTime: string) {
  const map = new Map<string, TimingEntry>();
  let currentMinutes = parseTimeToMinutes(startTime || '08:00:00 AM');
  const rowsToDisplay = visibleRows(rows);

  let index = 0;
  while (index < rowsToDisplay.length) {
    const start = formatMinutesToTimeWithSeconds(currentMinutes);
    const duration = Number(rowsToDisplay[index].duration) || 0;

    if (duration > 0) {
      currentMinutes += duration;
      const end = formatMinutesToTimeWithSeconds(currentMinutes);
      const formattedDuration = formatDurationToHMS(duration);
      map.set(rowIdentity(rowsToDisplay[index]), { start, end, duration: formattedDuration });
      index++;

      while (index < rowsToDisplay.length && (Number(rowsToDisplay[index].duration) || 0) === 0) {
        map.set(rowIdentity(rowsToDisplay[index]), { start, end, duration: '' });
        index++;
      }
    } else {
      while (index < rowsToDisplay.length && (Number(rowsToDisplay[index].duration) || 0) === 0) {
        map.set(rowIdentity(rowsToDisplay[index]), { start, end: start, duration: '' });
        index++;
      }
    }
  }

  return map;
}

/**
 * Compare what a person sees rather than the exact Rock storage syntax.
 * Equivalent legacy/plain/HTML text does not create noise; an attached cell
 * URL remains part of equality so changing the link is still visible.
 */
export function normalizeInlineDiffValue(value: string): string {
  const { contentHtml, url } = extractCellUrl(value || '');
  const text = htmlToPlainText(contentHtml)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${text}\u0000${(url || '').trim()}`;
}

export function classifyInlineDiffCell(sourceValue: string, targetValue: string): InlineDiffCell {
  const source = sourceValue || '';
  const target = targetValue || '';
  const sourceNormalized = normalizeInlineDiffValue(source);
  const targetNormalized = normalizeInlineDiffValue(target);

  if (sourceNormalized === targetNormalized) {
    return { status: 'same', sourceValue: source, targetValue: target };
  }

  const sourceEmpty = normalizeInlineDiffValue(source) === '\u0000';
  const targetEmpty = normalizeInlineDiffValue(target) === '\u0000';

  if (!sourceEmpty && targetEmpty) {
    return { status: 'removed', sourceValue: source, targetValue: target };
  }
  if (sourceEmpty && !targetEmpty) {
    return { status: 'added', sourceValue: source, targetValue: target };
  }
  return { status: 'changed', sourceValue: source, targetValue: target };
}

function readCell(
  row: RunsheetItemRow | null,
  columnKey: string,
  timingMap: Map<string, TimingEntry>,
): string {
  if (!row) return '';
  if (columnKey === 'START') return timingMap.get(rowIdentity(row))?.start || '';
  if (columnKey === 'END') return timingMap.get(rowIdentity(row))?.end || '';
  if (columnKey === 'DURATION') return timingMap.get(rowIdentity(row))?.duration || '';
  if (columnKey === 'title') return titleValue(row);
  return readRunsheetCellValue(row, columnKey);
}

function makeRow(
  sourceRow: RunsheetItemRow | null,
  targetRow: RunsheetItemRow | null,
  sourceIndex: number | null,
  targetIndex: number | null,
  rowStatus: InlineDiffRowStatus,
  columnKeys: string[],
  sourceTimingMap: Map<string, TimingEntry>,
  targetTimingMap: Map<string, TimingEntry>,
): InlineDiffRow {
  const cells: Record<string, InlineDiffCell> = {};
  for (const key of columnKeys) {
    cells[key] = classifyInlineDiffCell(
      readCell(sourceRow, key, sourceTimingMap),
      readCell(targetRow, key, targetTimingMap),
    );
  }

  const stableId = sourceRow ? `source:${rowIdentity(sourceRow)}` : `target:${rowIdentity(targetRow!)}`;
  return {
    key: stableId,
    rowStatus,
    sourceRow,
    targetRow,
    sourceIndex,
    targetIndex,
    cells,
  };
}

/**
 * Builds display-only rows for inline service Diff. Matching delegates to the
 * existing SIBLINGKEY/unique-title matcher; its backfill output is deliberately
 * ignored so this helper has no write side effect.
 */
export function buildInlineDiffRows(input: BuildInlineDiffRowsInput): InlineDiffRow[] {
  const sourceRows = visibleRows(input.sourceRows);
  const targetRows = visibleRows(input.targetRows);
  const sourceTimingMap = buildTimingMap(sourceRows, input.sourceStartTime);
  const targetTimingMap = buildTimingMap(targetRows, input.targetStartTime);
  const columnKeys = ['START', 'DURATION', 'title', ...input.columns.map((column) => column.key)];

  const matchResult = matchRows(sourceRows, input.targetChannelId, targetRows);
  const matchedTargetToSourceIndex = new Map<string, number>();
  const targetIndexById = new Map<string, number>();
  targetRows.forEach((row, index) => targetIndexById.set(rowIdentity(row), index));

  const matchedRowsByTargetIdentity = new Map<string, InlineDiffRow>();
  const matchedRows = matchResult.matches.map((match, sourceIndex) => {
    const targetRow = match.targetRow;
    const targetIndex = targetRow ? targetIndexById.get(rowIdentity(targetRow)) ?? null : null;
    if (targetRow) matchedTargetToSourceIndex.set(rowIdentity(targetRow), sourceIndex);
    const diffRow = makeRow(
      match.sourceRow,
      targetRow,
      sourceIndex,
      targetIndex,
      targetRow ? 'matched' : 'source-only',
      columnKeys,
      sourceTimingMap,
      targetTimingMap,
    );
    if (targetRow) matchedRowsByTargetIdentity.set(rowIdentity(targetRow), diffRow);
    return diffRow;
  });

  // Matched rows follow the target's visual order so target-only insertions
  // remain adjacent to their nearest target neighbor even when rows moved.
  const result: InlineDiffRow[] = [
    ...targetRows.flatMap((row) => {
      const matchedRow = matchedRowsByTargetIdentity.get(rowIdentity(row));
      return matchedRow ? [matchedRow] : [];
    }),
    ...matchedRows.filter((row) => row.rowStatus === 'source-only'),
  ];

  const targetOnlyRows = targetRows
    .map((row, targetIndex) => ({ row, targetIndex }))
    .filter(({ row }) => !matchedTargetToSourceIndex.has(rowIdentity(row)));

  // Insert unmatched target rows relative to their nearest matched target
  // neighbor. This preserves target order without ever pretending row indexes
  // imply correspondence.
  for (const { row, targetIndex } of targetOnlyRows) {
    let insertionIndex = result.length;
    let foundBackward = false;

    for (let i = targetIndex - 1; i >= 0; i--) {
      const sourceIndex = matchedTargetToSourceIndex.get(rowIdentity(targetRows[i]));
      if (sourceIndex === undefined) continue;
      insertionIndex = result.findIndex((candidate) => candidate.sourceIndex === sourceIndex) + 1;
      while (
        insertionIndex < result.length &&
        result[insertionIndex].rowStatus === 'target-only' &&
        (result[insertionIndex].targetIndex ?? -1) < targetIndex
      ) {
        insertionIndex++;
      }
      foundBackward = true;
      break;
    }

    if (!foundBackward) {
      for (let i = targetIndex + 1; i < targetRows.length; i++) {
        const sourceIndex = matchedTargetToSourceIndex.get(rowIdentity(targetRows[i]));
        if (sourceIndex === undefined) continue;
        const candidateIndex = result.findIndex((candidate) => candidate.sourceIndex === sourceIndex);
        if (candidateIndex >= 0) insertionIndex = candidateIndex;
        break;
      }
    }

    result.splice(
      insertionIndex,
      0,
      makeRow(
        null,
        row,
        null,
        targetIndex,
        'target-only',
        columnKeys,
        sourceTimingMap,
        targetTimingMap,
      ),
    );
  }

  return result;
}
