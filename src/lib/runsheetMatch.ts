/**
 * Pairs rows between a source runsheet and a sibling target so a cell edit
 * can be located in the other sheet. SIBLINGKEY is tried first because it
 * survives renames and reordering; a unique title is the fallback for rows
 * that predate the key, and every title match backfills the key onto both
 * sides so future matches for that pair are SIBLINGKEY matches.
 */
import { SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import { generateSiblingKey } from '@/lib/runsheetSiblingKey';
import type { RunsheetItemRow } from '@/types/Runsheet';

export interface RowMatch {
  sourceRow: RunsheetItemRow;
  targetRow: RunsheetItemRow | null;
  via: 'siblingKey' | 'title' | 'none';
}

export interface SiblingKeyBackfill {
  channelId: number;
  itemId: number;
  key: string;
}

export interface MatchResult {
  matches: RowMatch[];
  backfill: SiblingKeyBackfill[];
}

function keyOf(row: RunsheetItemRow): string | undefined {
  return row.attributeValues?.[SIBLINGKEY_ATTRIBUTE_KEY] || undefined;
}

function titleOf(row: RunsheetItemRow): string {
  return (row.attributeValues?.ACTIVITYTITLE || row.title || '').trim();
}

export function matchRows(
  sourceRows: RunsheetItemRow[],
  targetChannelId: number,
  targetRows: RunsheetItemRow[],
): MatchResult {
  const targetByKey = new Map<string, RunsheetItemRow>();
  for (const t of targetRows) {
    const k = keyOf(t);
    if (k) targetByKey.set(k, t);
  }

  const titleCounts = new Map<string, number>();
  for (const t of targetRows) {
    const title = titleOf(t);
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const targetByUniqueTitle = new Map<string, RunsheetItemRow>();
  for (const t of targetRows) {
    const title = titleOf(t);
    if (titleCounts.get(title) === 1) targetByUniqueTitle.set(title, t);
  }

  const matches: RowMatch[] = [];
  const backfill: SiblingKeyBackfill[] = [];

  for (const source of sourceRows) {
    const sourceKey = keyOf(source);
    const keyMatch = sourceKey ? targetByKey.get(sourceKey) : undefined;
    if (keyMatch) {
      matches.push({ sourceRow: source, targetRow: keyMatch, via: 'siblingKey' });
      continue;
    }

    const sourceTitle = titleOf(source);
    const isSourceTitleUnique =
      sourceRows.filter((r) => titleOf(r) === sourceTitle).length === 1;
    const titleMatch = isSourceTitleUnique ? targetByUniqueTitle.get(sourceTitle) : undefined;

    if (titleMatch) {
      matches.push({ sourceRow: source, targetRow: titleMatch, via: 'title' });
      if (typeof source.id === 'number' && typeof titleMatch.id === 'number') {
        const newKey = generateSiblingKey();
        backfill.push({ channelId: -1, itemId: source.id, key: newKey });
        backfill.push({ channelId: targetChannelId, itemId: titleMatch.id, key: newKey });
      }
      continue;
    }

    matches.push({ sourceRow: source, targetRow: null, via: 'none' });
  }

  return { matches, backfill };
}
