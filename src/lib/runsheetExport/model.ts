import {
  FALLBACK_RUNSHEET_COLUMNS,
  isPersonColumn,
  readRunsheetCellValue,
  RESERVED_RUNSHEET_COLUMN_KEYS,
  ROCK_PERSON_FIELD_TYPE_ID,
} from '@/constants/runsheetColumns';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import {
  extractChannelTime,
  extractChannelTitleDisplay,
  formatChannelDateDisplay,
} from '@/lib/runsheetDate';
import {
  formatDurationToHMS,
  formatMinutesToTimeWithSeconds,
  parseStartTimeFromRunsheetName,
  parseTimeToMinutes,
} from '@/lib/runsheetTime';
import type {
  DynamicAttributeColumn,
  RunsheetColumnMetadata,
  RunsheetDetails,
  RunsheetItemRow,
} from '@/types/Runsheet';
import { sanitizeTextForFont } from './fontCoverage';
import { isRunsheetPersonColumn, scrubPersonValue } from './personScrubber';
import { runsheetRichTextToPlainText } from './richTextPlain';

export interface RunsheetExportColumn {
  key: string;
  name: string;
  isPersonColumn: boolean;
  width?: number;
}

export interface RunsheetExportRow {
  id: number | string;
  order: number;
  title: string;
  activityTitle: string;
  start: string;
  duration: string;
  values: Record<string, string>;
}

export interface RunsheetExportModel {
  channelId: number;
  name: string;
  title: string;
  date: string;
  time: string;
  campus: string | null;
  subtitle: string;
  startTime: string;
  totalDuration: string;
  columns: RunsheetExportColumn[];
  rows: RunsheetExportRow[];
}

/**
 * Computes dynamic column list and order, exactly mirroring RunsheetTableEditor.
 * - Filters out reserved columns (ACTIVITYTITLE, TITLE)
 * - If columnMetadata.order is provided, stored order wins, and unlisted keys go last.
 * - Without a stored order, the editor's default rule applies: person/platform column
 *   is moved ahead of the description/detail column if it appears after it.
 */
export function computeDynamicColumns(
  columns?: DynamicAttributeColumn[],
  columnMetadata?: RunsheetColumnMetadata,
): DynamicAttributeColumn[] {
  const list = columns && columns.length > 0 ? columns : FALLBACK_RUNSHEET_COLUMNS;
  const filtered = list.filter((col) => !RESERVED_RUNSHEET_COLUMN_KEYS.includes(col.key));

  if (columnMetadata?.order && columnMetadata.order.length > 0) {
    const orderMap = new Map<string, number>();
    columnMetadata.order.forEach((key, idx) => orderMap.set(key, idx));

    return [...filtered].sort((a, b) => {
      const orderA = orderMap.has(a.key) ? orderMap.get(a.key)! : Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.has(b.key) ? orderMap.get(b.key)! : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }

  const isPlatformCol = (col: DynamicAttributeColumn) => {
    const k = col.key.toUpperCase();
    const n = col.name.toLowerCase();
    return k === 'PLATFORM' || k === 'ANCHORPREACHER' || n.includes('platform') || isPersonColumn(col);
  };

  const isDescriptionCol = (col: DynamicAttributeColumn) => {
    const k = col.key.toUpperCase();
    const n = col.name.toLowerCase();
    return k === 'DESCRIPTION' || k === 'DETIAL' || n.includes('description') || n.includes('detail');
  };

  const platformIdx = filtered.findIndex(isPlatformCol);
  const descIdx = filtered.findIndex(isDescriptionCol);

  if (platformIdx !== -1 && descIdx !== -1 && platformIdx > descIdx) {
    const result = [...filtered];
    const [platformCol] = result.splice(platformIdx, 1);
    result.splice(descIdx, 0, platformCol);
    return result;
  }

  return filtered;
}

/**
 * Builds the pure, serializable runsheet export model from raw RunsheetDetails.
 *
 * Rules:
 * - Excludes rows whose title starts with 'Roster:' and isDeleted rows.
 * - Sorts items by order.
 * - Seeds the clock from details.startTime, falling back to parseStartTimeFromRunsheetName(details.name).
 * - Gives zero-duration rows the parent segment's start time (editor's sub-item rule).
 * - Fixed Start, Duration, Activity Title columns followed by dynamic columns.
 * - Converts rich text HTML to readable plain text with lists and cell URLs.
 * - Only person-sourced columns are scrubbed for IDs/GUIDs/emails; authored free text renders verbatim.
 * - Text is deterministically sanitized against unsupported font glyphs.
 */
export function buildRunsheetExportModel(details: RunsheetDetails): RunsheetExportModel {
  const dynamicCols = computeDynamicColumns(details.columns, details.columnMetadata);

  const columns: RunsheetExportColumn[] = [
    { key: 'start', name: 'Start', isPersonColumn: false },
    { key: 'duration', name: 'Duration', isPersonColumn: false },
    { key: 'activityTitle', name: 'Activity Title', isPersonColumn: false },
    ...dynamicCols.map((col) => ({
      key: col.key,
      name: col.name,
      isPersonColumn: isRunsheetPersonColumn(col),
      width: col.width,
    })),
  ];

  // Exclude rows whose title starts with 'Roster:' or isDeleted
  const rawItems = details.items || [];
  const validItems = rawItems
    .filter((item) => !item.isDeleted && !(item.title && item.title.startsWith('Roster:')))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Seed clock from details.startTime falling back to parseStartTimeFromRunsheetName
  const startTimeRaw = (details.startTime && details.startTime.trim()) || parseStartTimeFromRunsheetName(details.name);
  let currentMinutes = parseTimeToMinutes(startTimeRaw);

  const rows: RunsheetExportRow[] = [];
  let totalDurationMinutes = 0;

  let index = 0;
  while (index < validItems.length) {
    const item = validItems[index];
    const duration = Number(item.duration) || 0;
    const startStr = formatMinutesToTimeWithSeconds(currentMinutes);

    if (duration > 0) {
      currentMinutes += duration;
      totalDurationMinutes += duration;
      const durStr = formatDurationToHMS(duration);

      rows.push(buildExportRow(item, startStr, durStr, dynamicCols));
      index++;

      // Zero-duration sub-items inherit the parent segment's start time
      while (index < validItems.length && (Number(validItems[index].duration) || 0) === 0) {
        rows.push(buildExportRow(validItems[index], startStr, '', dynamicCols));
        index++;
      }
    } else {
      // Leading zero-duration rows
      rows.push(buildExportRow(item, startStr, '', dynamicCols));
      index++;
    }
  }

  const channelName = details.name || '';
  const parsedTitle = channelName ? extractChannelTitleDisplay(channelName) : '';
  const parsedDate = channelName ? formatChannelDateDisplay(channelName) : '';
  const parsedTime = channelName ? extractChannelTime(channelName) : '';
  const parsedCampus = channelName ? extractRunsheetCampus(channelName) : null;

  return {
    channelId: details.channelId,
    name: sanitizeTextForFont(channelName),
    title: sanitizeTextForFont(parsedTitle),
    date: sanitizeTextForFont(parsedDate),
    time: sanitizeTextForFont(parsedTime),
    campus: parsedCampus,
    subtitle: sanitizeTextForFont(details.subtitle || ''),
    startTime: startTimeRaw,
    totalDuration: formatDurationToHMS(totalDurationMinutes),
    columns,
    rows,
  };
}

function buildExportRow(
  item: RunsheetItemRow,
  start: string,
  duration: string,
  dynamicCols: DynamicAttributeColumn[],
): RunsheetExportRow {
  const rawTitle = readRunsheetCellValue(item, 'ACTIVITYTITLE') || item.title || '';
  const plainTitle = runsheetRichTextToPlainText(rawTitle);
  const activityTitle = sanitizeTextForFont(plainTitle);
  const rowTitle = sanitizeTextForFont(item.title || plainTitle);

  const values: Record<string, string> = {
    start,
    duration,
    activityTitle,
  };

  for (const col of dynamicCols) {
    const rawVal = readRunsheetCellValue(item, col.key);
    let cellText: string;

    if (col.fieldTypeId === ROCK_PERSON_FIELD_TYPE_ID || isPersonColumn(col)) {
      cellText = scrubPersonValue(rawVal);
    } else {
      // NOTE: Only person-sourced values are scrubbed; authored free text
      // renders verbatim as in the UI (no global regex scrub).
      cellText = runsheetRichTextToPlainText(rawVal);
    }

    values[col.key] = sanitizeTextForFont(cellText);
  }

  return {
    id: item.id,
    order: item.order,
    title: rowTitle,
    activityTitle,
    start,
    duration,
    values,
  };
}
