'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { HiArrowsRightLeft, HiExclamationTriangle, HiXMark } from 'react-icons/hi2';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { htmlToPlainText, legacyValueToHtml } from '@/lib/richText';
import { sanitizeRichText } from '@/lib/sanitizeRichText';
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

const PLATFORM_COLUMN_KEYS = [
  'ANCHORPREACHER',
  'MAININSTRUMENT',
  'LEDLIVESCREENS',
  'LED WALL',
  'OVERLAYBROADCAST',
  'LIGHTING',
  'AUDIO',
];

function isPropagatableColumn(column: DynamicAttributeColumn): boolean {
  if (isPersonColumn(column)) return false;
  return !PLATFORM_COLUMN_KEYS.includes(column.key.toUpperCase());
}

function RenderRichCell({ value }: { value: string }) {
  if (!value) return <span className="text-slate-300 italic">—</span>;
  const html = legacyValueToHtml(value);
  const clean = sanitizeRichText(html);
  if (clean === null) {
    return <span className="text-slate-800 font-medium">{htmlToPlainText(value)}</span>;
  }
  return (
    <div
      className="prose prose-xs max-w-none text-slate-800 line-clamp-3 leading-snug [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export function RunsheetCompareView({ channelIds, onClose }: RunsheetCompareViewProps) {
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPeopleColumns, setShowPeopleColumns] = useState(false);
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);

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
          time: r.data!.name.split('//').pop()?.trim() || `Channel ${r.channelId}`,
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
        if (title && !seen.has(title)) {
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

  const handlePush = async (
    sourceSheet: LoadedSheet,
    itemTitle: string,
    columnKey: string,
    columnName: string,
    newValue: string
  ) => {
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
      if (outcomes.every((o) => o.ok)) {
        // Refresh comparison data after successful push
        const batch = await rockGetRunsheetDetailsBatch(channelIds);
        const loaded = batch
          .filter((r) => r.success && r.data)
          .map((r) => ({
            channelId: r.channelId,
            name: r.data!.name,
            time: r.data!.name.split('//').pop()?.trim() || `Channel ${r.channelId}`,
            columns: r.data!.columns,
            items: r.data!.items,
          }));
        setSheets(loaded);
        setPushPlan(null);
      }
    } finally {
      setPushApplying(false);
    }
  };

  const matrixRows = useMemo(() => {
    const list: { title: string; col: DynamicAttributeColumn; values: (string | null)[]; differs: boolean }[] = [];

    for (const title of rowTitles) {
      for (const col of allColumns) {
        const values = sheets.map((s) => cellValue(s, title, col.key));
        const nonNulls = values.filter((v): v is string => v !== null);
        const distinct = new Set(nonNulls.map((v) => htmlToPlainText(v).trim()));
        const differs = distinct.size > 1;

        if (showDifferencesOnly && !differs) continue;

        list.push({ title, col, values, differs });
      }
    }
    return list;
  }, [rowTitles, allColumns, sheets, showDifferencesOnly]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-xl">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="text-sm font-semibold text-slate-800">Loading service runsheet comparison…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-xs">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col bg-white shadow-2xl overflow-hidden md:my-4 md:h-[calc(100vh-2rem)] md:rounded-2xl border border-slate-200">
        {/* Header Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex items-center gap-2.5">
            <HiArrowsRightLeft className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-tight">Runsheet Compare Matrix</h2>
              <p className="text-xs text-slate-400 hidden sm:block">
                Side-by-side WYSIWYG comparison across {sheets.length} sibling services
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Close Compare Matrix"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDifferencesOnly}
                onChange={(e) => setShowDifferencesOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-semibold text-slate-900">Show Differences Only</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 hover:text-slate-900">
              <input
                type="checkbox"
                checked={showPeopleColumns}
                onChange={(e) => setShowPeopleColumns(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Include Roster & Platform Columns</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200">
              <HiExclamationTriangle className="h-3.5 w-3.5 text-amber-600" /> Differing Cell
            </span>
            <span className="text-slate-400">|</span>
            <span>{matrixRows.length} attributes compared</span>
          </div>
        </div>

        {/* WYSIWYG Compare Matrix Grid */}
        <div className="flex-1 overflow-auto bg-slate-100/50 p-3 sm:p-4">
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-900 text-white">
                  <th className="sticky top-0 z-20 w-48 sm:w-64 border-r border-slate-700 bg-slate-900 p-2.5 sm:p-3 font-semibold text-slate-200">
                    Segment & Column
                  </th>
                  {sheets.map((sheet) => (
                    <th
                      key={sheet.channelId}
                      className="sticky top-0 z-20 min-w-[200px] border-r border-slate-700 bg-slate-900 p-2.5 sm:p-3 font-semibold text-white last:border-r-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-blue-400">{sheet.time}</span>
                        <span className="text-[10px] text-slate-400 font-normal truncate max-w-[120px]">
                          {sheet.name.split('//')[0]?.trim()}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {matrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={sheets.length + 1} className="p-8 text-center text-slate-500">
                      {showDifferencesOnly
                        ? '✨ All compared attributes match perfectly across these services!'
                        : 'No attributes available to display.'}
                    </td>
                  </tr>
                ) : (
                  matrixRows.map(({ title, col, values, differs }, idx) => (
                    <tr
                      key={`${title}::${col.key}`}
                      className={`transition-colors ${
                        differs
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-slate-50/50 hover:bg-slate-100/60'
                      }`}
                    >
                      {/* Left Header Column */}
                      <td className="border-r border-slate-300 p-2.5 font-medium text-slate-900 bg-slate-50/80">
                        <div className="font-bold text-slate-900">{title}</div>
                        <div className="text-[11px] font-medium text-slate-500">{col.name}</div>
                      </td>

                      {/* Service Values Columns */}
                      {sheets.map((sheet, i) => {
                        const val = values[i];
                        const isMissing = val === null;

                        return (
                          <td
                            key={sheet.channelId}
                            className={`group relative border-r border-slate-200 p-2.5 align-top last:border-r-0 ${
                              differs ? 'border-amber-200/80' : ''
                            }`}
                          >
                            {isMissing ? (
                              <div className="text-slate-300 italic text-[11px]">— segment absent —</div>
                            ) : (
                              <div className="flex flex-col justify-between gap-1.5 h-full">
                                <RenderRichCell value={val} />

                                {differs && (
                                  <div className="mt-1 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      aria-label={`Push ${title} ${col.name} from ${sheet.time}`}
                                      onClick={() => handlePush(sheet, title, col.key, col.name, val)}
                                      className="inline-flex items-center gap-1 rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer active:scale-95 transition-all"
                                      title="Push this exact value to all sibling service runsheets"
                                    >
                                      <span>⤳ Push to others</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
