'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { HiArrowsRightLeft, HiExclamationTriangle, HiXMark } from 'react-icons/hi2';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { PeopleSearchDropdown, parsePeopleString } from './PeopleSearchDropdown';
import { htmlToPlainText, legacyValueToHtml } from '@/lib/richText';
import { sanitizeRichText } from '@/lib/sanitizeRichText';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

interface RunsheetCompareViewProps {
  channelIds: number[];
  availableChannels?: RunsheetChannelOption[];
  onSelectionChange?: (channelIds: number[]) => void;
  onClose: () => void;
  readOnly?: boolean;
  /** Invalidate each manager detail query after an attempted compare write. */
  onSaveSettled?: (channelId: number) => void;
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

function RenderRichCell({ value, textClass = 'text-slate-800' }: { value: string; textClass?: string }) {
  if (!value) return <span className="text-slate-300 italic">—</span>;
  const html = legacyValueToHtml(value);
  const clean = sanitizeRichText(html);
  if (clean === null) {
    return <span className={`${textClass} font-medium whitespace-pre-wrap`}>{htmlToPlainText(value)}</span>;
  }
  return (
    <div
      className={`prose prose-xs max-w-none ${textClass} leading-snug [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0 [&>p]:inline [&>span]:inline`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/** Person columns (Platform roles, Service Roles) render as name chips instead of rich text — matches RunsheetTableEditor's person-cell treatment. */
function RenderPeopleCell({ value, textClass = 'text-slate-800' }: { value: string; textClass?: string }) {
  if (!value) return <span className="text-slate-300 italic">—</span>;
  return (
    <div className={`flex flex-wrap items-center gap-1 font-medium ${textClass}`}>
      {parsePeopleString(value).map((person, i, arr) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span>{person.name}</span>
          {person.isGuest && (
            <span className="rounded bg-amber-100 text-amber-900 px-1 py-0.2 text-[10px] font-bold border border-amber-300">
              Guest
            </span>
          )}
          {i < arr.length - 1 && <span className="text-slate-400 mr-0.5">,</span>}
        </span>
      ))}
    </div>
  );
}

export function RunsheetCompareView({
  channelIds,
  availableChannels = [],
  onSelectionChange,
  onClose,
  readOnly = false,
  onSaveSettled,
}: RunsheetCompareViewProps) {
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>(() => {
    if (channelIds.length >= 2) return channelIds;
    if (availableChannels.length >= 2) return availableChannels.slice(0, 2).map((c) => c.id);
    return channelIds;
  });
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

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const fetchSheets = React.useCallback(async (idsToFetch: number[]) => {
    if (idsToFetch.length === 0) {
      setSheets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const batch = await rockGetRunsheetDetailsBatch(idsToFetch);
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
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await fetchSheets(selectedChannelIds);
    })();
    return () => {
      active = false;
    };
  }, [fetchSheets, selectedChannelIds]);

  useEffect(() => {
    if (!readOnly) return;
    setEditingCell(null);
    setEditDraft('');
    setDirtyEdits(new Map());
    setMatrixSaveStatus(null);
    setShowUnsavedModal(false);
  }, [readOnly]);

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

  /** The single attribute a "Roster: <role>" row actually stores — whoever's assigned. */
  const rosterPersonColumn = useMemo(() => {
    for (const sheet of sheets) {
      const col = sheet.columns.find(isPersonColumn);
      if (col) return col;
    }
    return null;
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
    if (readOnly) return;
    setEditingCell({ channelId, itemTitle, columnKey });
    setEditDraft(htmlToPlainText(currentValue));
  };

  /**
   * Records (or clears) a cell edit. Shared by the plain-text textarea's
   * blur-commit and the people picker's per-selection commit — a no-op
   * change (value back to the original) removes any existing dirty entry
   * instead of marking the cell dirty for nothing.
   */
  const commitCellValue = (channelId: number, itemTitle: string, columnKey: string, newValue: string) => {
    const sheet = sheets.find((s) => s.channelId === channelId);
    const item = sheet?.items.find((i) => (i.attributeValues?.ACTIVITYTITLE || i.title) === itemTitle);
    const originalValue = htmlToPlainText(item?.attributeValues?.[columnKey] ?? '');

    setDirtyEdits((prev) => {
      if (newValue === originalValue) {
        const channelMap = prev.get(channelId);
        const itemMap = channelMap?.get(itemTitle);
        if (!itemMap?.has(columnKey)) return prev;

        const next = new Map(prev);
        const nextChannelMap = new Map(channelMap);
        const nextItemMap = new Map(itemMap);
        nextItemMap.delete(columnKey);
        nextChannelMap.set(itemTitle, nextItemMap);
        next.set(channelId, nextChannelMap);
        return next;
      }

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
      itemMap.set(columnKey, newValue);
      return next;
    });
  };

  const handleSaveEditCell = () => {
    if (readOnly || !editingCell) return;
    const { channelId, itemTitle, columnKey } = editingCell;
    commitCellValue(channelId, itemTitle, columnKey, editDraft);
    setEditingCell(null);
    setEditDraft('');
  };

  const handleSelectPersonInCell = (selectedName: string) => {
    if (readOnly || !editingCell) return;
    const { channelId, itemTitle, columnKey } = editingCell;
    setEditDraft(selectedName);
    commitCellValue(channelId, itemTitle, columnKey, selectedName);
  };

  const hasDirtyEdits = useMemo(() => {
    for (const channelMap of dirtyEdits.values()) {
      for (const itemMap of channelMap.values()) {
        if (itemMap.size > 0) return true;
      }
    }
    return false;
  }, [dirtyEdits]);

  const handleSaveAllMatrixEdits = async (): Promise<boolean> => {
    if (readOnly || !hasDirtyEdits || savingMatrix) return true;
    setSavingMatrix(true);
    setMatrixSaveStatus(null);
    const attemptedChannelIds: number[] = [];

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
          attemptedChannelIds.push(channelId);
          savePromises.push(rockBulkSaveRunsheetItems(channelId, itemsToSave, [], sheet.columns));
        }
      }

      const results = await Promise.all(savePromises);
      const allOk = results.every((r) => r.success);

      if (allOk) {
        setDirtyEdits(new Map());
        setMatrixSaveStatus('All comparison edits saved successfully!');
        await fetchSheets(selectedChannelIds);
        return true;
      } else {
        setMatrixSaveStatus('Some edits failed to save to Rock. Please try again.');
        return false;
      }
    } catch (err: any) {
      setMatrixSaveStatus(`Error saving edits: ${err?.message || 'Unknown error'}`);
      return false;
    } finally {
      // Compare writes use a separate batch read/state path from the manager.
      // Notify it for every attempted channel, including partial/error results,
      // so its detail query cannot remain fresh with pre-save data.
      // The IDs are captured in the save loop and are intentionally local to
      // this invocation; read-only compare never enters this path.
      attemptedChannelIds.forEach((channelId) => onSaveSettled?.(channelId));
      setSavingMatrix(false);
    }
  };

  const handleRequestClose = () => {
    if (hasDirtyEdits) {
      setShowUnsavedModal(true);
      return;
    }
    onClose();
  };

  const handleSaveAndClose = async () => {
    const success = await handleSaveAllMatrixEdits();
    if (success) {
      setShowUnsavedModal(false);
      onClose();
    }
  };

  const handleDiscardAndClose = () => {
    setShowUnsavedModal(false);
    onClose();
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
      // Service role rows ("Roster: Music Director") only ever hold one
      // meaningful attribute — who's assigned — so they compare just the
      // role title against the name(s) underneath it, not every column.
      if (title.startsWith('Roster:')) {
        if (!rosterPersonColumn) continue;

        const values = sheets.map((s) => cellValue(s, title, rosterPersonColumn.key));
        const nonNulls = values.filter((v): v is string => v !== null);
        const distinct = new Set(nonNulls.map((v) => htmlToPlainText(v).trim()));
        const differs = distinct.size > 1;

        if (showDifferencesOnly && !differs) continue;

        result.push({
          title: title.replace(/^Roster:\s*/, ''),
          columns: [{ col: { ...rosterPersonColumn, name: 'Assigned' }, values, differs }],
          hasDifferences: differs,
        });
        continue;
      }

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
  }, [rowTitles, allColumns, sheets, showDifferencesOnly, cellValue, rosterPersonColumn]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-xs">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col bg-white shadow-2xl overflow-hidden md:my-3 md:h-[calc(100vh-1.5rem)] md:rounded-2xl border border-slate-200">
        {/* Header Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-2.5 text-white sm:px-6">
          <div className="flex items-center gap-2">
            <HiArrowsRightLeft className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm sm:text-base font-bold leading-tight">Runsheet Comparison</h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Close Compare View"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>

        {/* Runsheet Selection Bar */}
        {availableChannels && availableChannels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-100/90 px-3 sm:px-6 py-2 text-xs">
            <span className="font-bold text-slate-700 mr-1">Select to Compare:</span>
            {availableChannels.map((c) => {
              const isSelected = selectedChannelIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    let next: number[];
                    if (isSelected) {
                      if (selectedChannelIds.length <= 1) return; // keep at least 1
                      next = selectedChannelIds.filter((id) => id !== c.id);
                    } else {
                      if (selectedChannelIds.length >= 4) return; // max 4
                      next = [...selectedChannelIds, c.id];
                    }
                    setSelectedChannelIds(next);
                    onSelectionChange?.(next);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 border-blue-700 text-white shadow-xs font-bold'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title={isSelected ? 'Click to remove from comparison' : 'Click to add to comparison'}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-400'}`} />
                  <span>{c.name.split('//').pop()?.trim() || c.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {showUnsavedModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl border border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Unsaved Comparison Edits</h3>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
                You have unsaved edits in this comparison view. What would you like to do before leaving?
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={readOnly || savingMatrix}
                  className="w-full rounded-lg bg-pink-700 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-800 cursor-pointer disabled:opacity-50"
                >
                  {savingMatrix ? 'Saving to Rock...' : '1. Save & Leave'}
                </button>

                <button
                  type="button"
                  onClick={handleDiscardAndClose}
                  disabled={savingMatrix}
                  className="w-full rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                >
                  2. Discard & Leave
                </button>

                <button
                  type="button"
                  onClick={() => setShowUnsavedModal(false)}
                  disabled={savingMatrix}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  3. Cancel & Continue Editing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar & Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-slate-50 px-3 sm:px-6 py-2">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDifferencesOnly}
                onChange={(e) => setShowDifferencesOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-semibold text-slate-900">Show Differences Only</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 hover:text-slate-900">
              <input
                type="checkbox"
                checked={showPeopleColumns}
                onChange={(e) => setShowPeopleColumns(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Include Roster & Platform Columns</span>
            </label>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            {matrixSaveStatus && (
              <span className="font-medium text-slate-700 bg-slate-200 px-2 py-0.5 rounded text-[11px]">{matrixSaveStatus}</span>
            )}

            {!readOnly && (
              <button
                type="button"
                disabled={!hasDirtyEdits || savingMatrix}
                onClick={handleSaveAllMatrixEdits}
                className="inline-flex items-center gap-1.5 rounded-lg bg-pink-700 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-pink-800 disabled:opacity-40 cursor-pointer transition-all"
              >
                {savingMatrix ? 'Saving Edits...' : 'Save Comparison Edits'}
              </button>
            )}
          </div>
        </div>

        {/* Per-Segment WYSIWYG Row Comparison List */}
        <div className="flex-1 overflow-auto bg-slate-100/60 p-2.5 sm:p-4 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                <span className="text-xs font-semibold text-slate-800">Loading service runsheet comparison…</span>
              </div>
            </div>
          ) : segmentRows.length === 0 ? (
            <div className="rounded-xl border border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm">
              {showDifferencesOnly
                ? '✨ All segments and attributes match perfectly across these services!'
                : 'No segment data available to compare.'}
            </div>
          ) : (
            segmentRows.map((segment) => (
              <div
                key={segment.title}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${segment.hasDifferences ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-slate-200'
                  }`}
              >
                {/* Segment Header Bar */}
                <div
                  className={`flex items-center justify-between px-3 py-1.5 border-b font-bold text-xs ${segment.hasDifferences ? 'bg-amber-100/70 border-amber-200 text-amber-950' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <RenderRichCell
                      value={segment.title}
                      textClass={segment.hasDifferences ? 'text-amber-950 font-bold text-xs sm:text-sm' : 'text-white font-bold text-xs sm:text-sm'}
                    />
                    {segment.hasDifferences && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                        <HiExclamationTriangle className="h-3 w-3 text-amber-700" /> Differing
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-normal opacity-80">{segment.columns.length} cols</span>
                </div>

                {/* Service Columns Comparison Table within Segment */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold text-[11px]">
                        <th className="w-32 sm:w-40 border-r border-slate-200 p-1.5 sm:p-2 bg-slate-100/80 text-slate-900">
                          Attribute
                        </th>
                        {sheets.map((sheet) => (
                          <th key={sheet.channelId} className="min-w-[180px] border-r border-slate-200 p-1.5 sm:p-2 last:border-r-0">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-slate-900">{sheet.time}</span>
                              <span className="text-[10px] text-slate-500 font-normal truncate max-w-[100px]">
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
                          className={`transition-colors ${differs ? 'bg-amber-50/50 hover:bg-amber-50/80' : 'hover:bg-slate-50/80'
                            }`}
                        >
                          {/* Attribute Name Column */}
                          <td className="border-r border-slate-200 p-1.5 sm:p-2 font-semibold text-slate-700 bg-slate-50/60 align-top text-[11px]">
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
                                className={`group relative border-r border-slate-200 p-1.5 sm:p-2 align-top last:border-r-0 text-[11px] ${differs ? 'border-amber-200/80' : ''
                                  } ${isCellDirty ? 'bg-pink-50/80 ring-1 ring-pink-300 inset-0' : ''} ${!isMissing && !isEditingThisCell ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
                                onClick={() => {
                                  if (!readOnly && !isMissing && !isEditingThisCell) {
                                    handleStartEditCell(sheet.channelId, segment.title, col.key, val);
                                  }
                                }}
                              >
                                {isMissing ? (
                                  <div className="text-slate-300 italic text-[11px]">— segment absent —</div>
                                ) : isEditingThisCell && isPersonColumn(col) ? (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <PeopleSearchDropdown
                                      initialValue={editDraft}
                                      onSelectPerson={handleSelectPersonInCell}
                                      onClose={() => setEditingCell(null)}
                                    />
                                  </div>
                                ) : isEditingThisCell ? (
                                  <textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    onBlur={handleSaveEditCell}
                                    className="w-full rounded border border-blue-500 bg-white p-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]"
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <div className="flex flex-col justify-between gap-1.5 h-full min-h-[38px]">
                                    {isPersonColumn(col) ? <RenderPeopleCell value={val} /> : <RenderRichCell value={val} />}
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
    </div>
  );
}
