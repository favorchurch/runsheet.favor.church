'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { HiArrowsRightLeft, HiExclamationTriangle, HiPencilSquare, HiXMark } from 'react-icons/hi2';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { htmlToPlainText, legacyValueToHtml } from '@/lib/richText';
import { sanitizeRichText } from '@/lib/sanitizeRichText';
import { matchRows, type MatchResult } from '@/lib/runsheetMatch';
import { buildPropagationPlan, type CandidateCellChange, type PropagationPlan } from '@/lib/runsheetPropagate';
import { executePropagationPlan, type PropagationOutcome } from '@/lib/runsheetPropagateExecute';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
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
    return <span className="text-slate-800 font-medium whitespace-pre-wrap">{htmlToPlainText(value)}</span>;
  }
  return (
    <div
      className="prose prose-xs max-w-none text-slate-800 leading-snug [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export function RunsheetCompareView({ channelIds, onClose }: RunsheetCompareViewProps) {
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPeopleColumns, setShowPeopleColumns] = useState(false);
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);

  // In-place inline cell editing state
  const [editingCell, setEditingCell] = useState<{ channelId: number; itemTitle: string; columnKey: string } | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // Dirty matrix tracking: channelId -> itemTitle -> columnKey -> newValue
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Map<string, Map<string, string>>>>(new Map());
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [matrixSaveStatus, setMatrixSaveStatus] = useState<string | null>(null);

  // Push to others state
  const [pushPlan, setPushPlan] = useState<PropagationPlan | null>(null);
  const [pushTargetRows, setPushTargetRows] = useState<Map<number, RunsheetItemRow[]>>(new Map());
  const [pushApplying, setPushApplying] = useState(false);
  const [pushOutcomes, setPushOutcomes] = useState<PropagationOutcome[] | undefined>(undefined);

  const fetchSheets = React.useCallback(async () => {
    const batch = await rockGetRunsheetDetailsBatch(channelIds);
    return batch
      .filter((r) => r.success && r.data)
      .map((r) => ({
        channelId: r.channelId,
        name: r.data!.name,
        time: r.data!.name.split('//').pop()?.trim() || `Channel ${r.channelId}`,
        columns: r.data!.columns,
        items: r.data!.items,
      }));
  }, [channelIds]);

  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await fetchSheets();
      if (!active) return;
      setSheets(loaded);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchSheets]);

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

  // Evaluates cell value considering any unsaved in-memory matrix edits
  const cellValue = React.useCallback(
    (sheet: LoadedSheet, itemTitle: string, columnKey: string): string | null => {
      const channelEdits = dirtyEdits.get(sheet.channelId);
      const itemEdits = channelEdits?.get(itemTitle);
      if (itemEdits?.has(columnKey)) {
        return itemEdits.get(columnKey)!;
      }
      const item = sheet.items.find((i) => (i.attributeValues?.ACTIVITYTITLE || i.title) === itemTitle);
      if (!item) return null;
      return item.attributeValues?.[columnKey] ?? '';
    },
    [dirtyEdits]
  );

  const handleStartEditCell = (channelId: number, itemTitle: string, columnKey: string, currentValue: string) => {
    setEditingCell({ channelId, itemTitle, columnKey });
    setEditDraft(htmlToPlainText(currentValue));
  };

  const handleSaveEditCell = () => {
    if (!editingCell) return;
    const { channelId, itemTitle, columnKey } = editingCell;

    setDirtyEdits((prev) => {
      const next = new Map(prev);
      let channelMap = next.get(channelId);
      if (!channelMap) {
        channelMap = new Map();
        next.set(channelId, channelMap);
      }
      let itemMap = channelMap.get(itemTitle);
      if (!itemMap) {
        itemMap = new Map();
        channelMap.set(itemTitle, itemMap);
      }
      itemMap.set(columnKey, editDraft);
      return next;
    });

    setEditingCell(null);
    setEditDraft('');
  };

  const hasDirtyEdits = useMemo(() => {
    for (const channelMap of dirtyEdits.values()) {
      for (const itemMap of channelMap.values()) {
        if (itemMap.size > 0) return true;
      }
    }
    return false;
  }, [dirtyEdits]);

  const handleSaveAllMatrixEdits = async () => {
    if (!hasDirtyEdits || savingMatrix) return;
    setSavingMatrix(true);
    setMatrixSaveStatus(null);

    try {
      const savePromises: Promise<any>[] = [];

      for (const [channelId, itemMap] of dirtyEdits.entries()) {
        const sheet = sheets.find((s) => s.channelId === channelId);
        if (!sheet) continue;

        const itemsToSave: RunsheetItemRow[] = [];

        for (const [itemTitle, columnEdits] of itemMap.entries()) {
          const item = sheet.items.find((i) => (i.attributeValues?.ACTIVITYTITLE || i.title) === itemTitle);
          if (!item) continue;

          const attributeValues = { ...item.attributeValues };
          const changedKeys: string[] = [];

          for (const [colKey, newVal] of columnEdits.entries()) {
            attributeValues[colKey] = newVal;
            changedKeys.push(colKey);
          }

          itemsToSave.push({
            ...item,
            attributeValues,
            changedKeys,
          });
        }

        if (itemsToSave.length > 0) {
          savePromises.push(rockBulkSaveRunsheetItems(channelId, itemsToSave, [], sheet.columns));
        }
      }

      const results = await Promise.all(savePromises);
      const allOk = results.every((r) => r.success);

      if (allOk) {
        setDirtyEdits(new Map());
        setMatrixSaveStatus('All comparison edits saved successfully!');
        const freshSheets = await fetchSheets();
        setSheets(freshSheets);
      } else {
        setMatrixSaveStatus('Some edits failed to save to Rock. Please try again.');
      }
    } catch (err: any) {
      setMatrixSaveStatus(`Error saving edits: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingMatrix(false);
    }
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
        const loaded = await fetchSheets();
        setSheets(loaded);
        setPushPlan(null);
      }
    } finally {
      setPushApplying(false);
    }
  };

  // Group comparison data by segment row (title)
  const segmentRows = useMemo(() => {
    const result: {
      title: string;
      columns: {
        col: DynamicAttributeColumn;
        values: (string | null)[];
        differs: boolean;
      }[];
      hasDifferences: boolean;
    }[] = [];

    for (const title of rowTitles) {
      const columnsInSegment: { col: DynamicAttributeColumn; values: (string | null)[]; differs: boolean }[] = [];
      let segmentDiffers = false;

      for (const col of allColumns) {
        const values = sheets.map((s) => cellValue(s, title, col.key));
        const nonNulls = values.filter((v): v is string => v !== null);
        const distinct = new Set(nonNulls.map((v) => htmlToPlainText(v).trim()));
        const differs = distinct.size > 1;

        if (differs) segmentDiffers = true;
        if (!showDifferencesOnly || differs) {
          columnsInSegment.push({ col, values, differs });
        }
      }

      if (columnsInSegment.length > 0) {
        result.push({
          title,
          columns: columnsInSegment,
          hasDifferences: segmentDiffers,
        });
      }
    }

    return result;
  }, [rowTitles, allColumns, sheets, showDifferencesOnly, cellValue]);

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
              <h2 className="text-base sm:text-lg font-bold leading-tight">Per-Segment Runsheet Comparison</h2>
              <p className="text-xs text-slate-400 hidden sm:block">
                Side-by-side WYSIWYG per-segment row comparison & inline editing across {sheets.length} sibling services
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Close Compare View"
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

          <div className="flex items-center gap-3 text-xs">
            {matrixSaveStatus && (
              <span className="font-medium text-slate-700 bg-slate-200 px-2 py-1 rounded">{matrixSaveStatus}</span>
            )}

            <button
              type="button"
              disabled={!hasDirtyEdits || savingMatrix}
              onClick={handleSaveAllMatrixEdits}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pink-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-pink-800 disabled:opacity-40 cursor-pointer transition-all"
            >
              {savingMatrix ? 'Saving Edits...' : 'Save Comparison Edits'}
            </button>
          </div>
        </div>

        {/* Per-Segment WYSIWYG Row Comparison List */}
        <div className="flex-1 overflow-auto bg-slate-100/60 p-3 sm:p-5 space-y-4">
          {segmentRows.length === 0 ? (
            <div className="rounded-xl border border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm">
              {showDifferencesOnly
                ? '✨ All segments and attributes match perfectly across these services!'
                : 'No segment data available to compare.'}
            </div>
          ) : (
            segmentRows.map((segment) => (
              <div
                key={segment.title}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
                  segment.hasDifferences ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-slate-200'
                }`}
              >
                {/* Segment Header Bar */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 border-b font-bold text-xs ${
                    segment.hasDifferences ? 'bg-amber-100/70 border-amber-200 text-amber-950' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{segment.title}</span>
                    {segment.hasDifferences && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                        <HiExclamationTriangle className="h-3 w-3 text-amber-700" /> Differing Attributes
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-normal opacity-80">{segment.columns.length} columns</span>
                </div>

                {/* Service Columns Comparison Table within Segment */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold text-[11px]">
                        <th className="w-36 sm:w-44 border-r border-slate-200 p-2.5 bg-slate-100/80 text-slate-900">
                          Attribute
                        </th>
                        {sheets.map((sheet) => (
                          <th key={sheet.channelId} className="min-w-[200px] border-r border-slate-200 p-2.5 last:border-r-0">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-slate-900">{sheet.time}</span>
                              <span className="text-[10px] text-slate-500 font-normal truncate max-w-[110px]">
                                {sheet.name.split('//')[0]?.trim()}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {segment.columns.map(({ col, values, differs }) => (
                        <tr
                          key={`${segment.title}::${col.key}`}
                          className={`transition-colors ${
                            differs ? 'bg-amber-50/50 hover:bg-amber-50/80' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Attribute Name Column */}
                          <td className="border-r border-slate-200 p-2.5 font-semibold text-slate-700 bg-slate-50/60 align-top">
                            {col.name}
                          </td>

                          {/* Service Value Cells */}
                          {sheets.map((sheet, i) => {
                            const val = values[i];
                            const isMissing = val === null;
                            const isEditingThisCell =
                              editingCell?.channelId === sheet.channelId &&
                              editingCell?.itemTitle === segment.title &&
                              editingCell?.columnKey === col.key;
                            const isCellDirty = dirtyEdits.get(sheet.channelId)?.get(segment.title)?.has(col.key);

                            return (
                              <td
                                key={sheet.channelId}
                                className={`group relative border-r border-slate-200 p-2.5 align-top last:border-r-0 ${
                                  differs ? 'border-amber-200/80' : ''
                                } ${isCellDirty ? 'bg-pink-50/80 ring-1 ring-pink-300 inset-0' : ''}`}
                              >
                                {isMissing ? (
                                  <div className="text-slate-300 italic text-[11px]">— segment absent —</div>
                                ) : isEditingThisCell ? (
                                  <div className="flex flex-col gap-1.5">
                                    <textarea
                                      value={editDraft}
                                      onChange={(e) => setEditDraft(e.target.value)}
                                      className="w-full rounded border border-blue-500 bg-white p-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]"
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingCell(null)}
                                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleSaveEditCell}
                                        className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-blue-700 cursor-pointer"
                                      >
                                        Done
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col justify-between gap-1.5 h-full min-h-[38px]">
                                    <RenderRichCell value={val} />

                                    <div className="mt-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditCell(sheet.channelId, segment.title, col.key, val)}
                                        className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer"
                                        title="Edit this cell in-place"
                                      >
                                        <HiPencilSquare className="h-3 w-3 text-slate-500" />
                                        <span>Edit</span>
                                      </button>

                                      {differs && (
                                        <button
                                          type="button"
                                          aria-label={`Push ${segment.title} ${col.name} from ${sheet.time}`}
                                          onClick={() => handlePush(sheet, segment.title, col.key, col.name, val)}
                                          className="inline-flex items-center gap-1 rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer active:scale-95 transition-all"
                                          title="Push this exact value to all sibling service runsheets"
                                        >
                                          <span>⤳ Push to others</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
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
