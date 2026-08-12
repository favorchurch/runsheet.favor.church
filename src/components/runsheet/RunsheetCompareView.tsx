'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { matchRows, type MatchResult } from '@/lib/runsheetMatch';
import { buildPropagationPlan, type CandidateCellChange, type PropagationPlan } from '@/lib/runsheetPropagate';
import { executePropagationPlan, type PropagationOutcome } from '@/lib/runsheetPropagateExecute';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { PropagateReviewPanel } from './PropagateReviewPanel';

interface RunsheetCompareViewProps {
  channelIds: number[];
  onClose: () => void;
}

interface LoadedSheet {
  channelId: number;
  name: string;
  time: string;
  columns: DynamicAttributeColumn[];
  items: RunsheetItemRow[];
}

const PLATFORM_COLUMN_KEYS = ['ANCHORPREACHER', 'MAININSTRUMENT', 'LEDLIVESCREENS', 'LED WALL', 'OVERLAYBROADCAST', 'LIGHTING', 'AUDIO'];

function isPropagatableColumn(column: DynamicAttributeColumn): boolean {
  if (isPersonColumn(column)) return false;
  return !PLATFORM_COLUMN_KEYS.includes(column.key.toUpperCase());
}

export function RunsheetCompareView({ channelIds, onClose }: RunsheetCompareViewProps) {
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPeopleColumns, setShowPeopleColumns] = useState(false);
  const [pushPlan, setPushPlan] = useState<PropagationPlan | null>(null);
  const [pushTargetRows, setPushTargetRows] = useState<Map<number, RunsheetItemRow[]>>(new Map());
  const [pushApplying, setPushApplying] = useState(false);
  const [pushOutcomes, setPushOutcomes] = useState<PropagationOutcome[] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const batch = await rockGetRunsheetDetailsBatch(channelIds);
      if (!active) return;
      const loaded = batch
        .filter((r) => r.success && r.data)
        .map((r) => ({
          channelId: r.channelId,
          name: r.data!.name,
          time: r.data!.name.split('//').pop()?.trim() || '',
          columns: r.data!.columns,
          items: r.data!.items,
        }));
      setSheets(loaded);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [channelIds]);

  const allColumns = useMemo(() => {
    const seen = new Map<string, DynamicAttributeColumn>();
    for (const sheet of sheets) {
      for (const col of sheet.columns) {
        if (!showPeopleColumns && !isPropagatableColumn(col)) continue;
        if (!seen.has(col.key)) seen.set(col.key, col);
      }
    }
    return Array.from(seen.values());
  }, [sheets, showPeopleColumns]);

  const rowTitles = useMemo(() => {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const sheet of sheets) {
      for (const item of sheet.items) {
        const title = item.attributeValues?.ACTIVITYTITLE || item.title;
        if (!seen.has(title)) {
          seen.add(title);
          titles.push(title);
        }
      }
    }
    return titles;
  }, [sheets]);

  const cellValue = (sheet: LoadedSheet, itemTitle: string, columnKey: string): string | null => {
    const item = sheet.items.find((i) => (i.attributeValues?.ACTIVITYTITLE || i.title) === itemTitle);
    if (!item) return null;
    return item.attributeValues?.[columnKey] ?? '';
  };

  const handlePush = async (sourceSheet: LoadedSheet, itemTitle: string, columnKey: string, columnName: string, newValue: string) => {
    const others = sheets.filter((s) => s.channelId !== sourceSheet.channelId);
    const matchResultsByChannel = new Map<number, MatchResult>();
    const targetRowsMap = new Map<number, RunsheetItemRow[]>();

    for (const target of others) {
      matchResultsByChannel.set(target.channelId, matchRows(sourceSheet.items, target.channelId, target.items));
      targetRowsMap.set(target.channelId, target.items);
    }

    const candidate: CandidateCellChange = {
      itemTitle,
      columnKey,
      columnName,
      newValue,
      previousValue: newValue,
    };

    const siblings = others.map((s) => ({ channelId: s.channelId, name: s.name, time: s.time, preselected: true }));
    const plan = buildPropagationPlan([candidate], matchResultsByChannel, siblings, sourceSheet.columns);

    const forcedPlan: PropagationPlan = {
      targets: plan.targets.map((t) => ({
        ...t,
        changes: t.changes.map((c) => (c.status === 'unmatched' ? c : { ...c, status: 'clean' as const, selected: true })),
      })),
    };

    setPushTargetRows(targetRowsMap);
    setPushPlan(forcedPlan);
    setPushOutcomes(undefined);
  };

  const handlePushApply = async () => {
    if (!pushPlan) return;
    setPushApplying(true);
    try {
      const outcomes = await executePropagationPlan(pushPlan, pushTargetRows, allColumns);
      setPushOutcomes(outcomes);
      if (outcomes.every((o) => o.ok)) setPushPlan(null);
    } finally {
      setPushApplying(false);
    }
  };

  if (loading) return <div>Loading comparison…</div>;

  return (
    <div className="runsheet-compare-view">
      <div className="runsheet-compare-header">
        <button type="button" onClick={onClose}>Close</button>
        <label>
          <input type="checkbox" checked={showPeopleColumns} onChange={(e) => setShowPeopleColumns(e.target.checked)} />
          Show people/platform columns
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Segment</th>
            {sheets.map((s) => <th key={s.channelId}>{s.time}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowTitles.map((title) =>
            allColumns.map((col) => {
              const values = sheets.map((s) => cellValue(s, title, col.key));
              const distinctValues = new Set(values.filter((v) => v !== null));
              const differs = distinctValues.size > 1;

              return (
                <tr key={`${title}::${col.key}`}>
                  <td>{title} · {col.name}</td>
                  {sheets.map((s, i) => {
                    const value = values[i];
                    if (value === null) return <td key={s.channelId} className="runsheet-compare-gap">—</td>;
                    return (
                      <td key={s.channelId} className={differs ? 'runsheet-compare-diff' : 'runsheet-compare-same'}>
                        {value}
                        {differs && (
                          <button
                            type="button"
                            aria-label={`Push ${title} ${col.name} from ${s.time}`}
                            onClick={() => handlePush(s, title, col.key, col.name, value)}
                          >
                            ⤳ Push to others
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>

      {pushPlan && (
        <PropagateReviewPanel
          plan={pushPlan}
          onOverwrite={() => {}}
          onApply={handlePushApply}
          applying={pushApplying}
          outcomes={pushOutcomes}
        />
      )}
    </div>
  );
}
