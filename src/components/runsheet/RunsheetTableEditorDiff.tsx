'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FALLBACK_RUNSHEET_COLUMNS, HIDDEN_ATTRIBUTE_KEYS, RESERVED_RUNSHEET_COLUMN_KEYS } from '@/constants/runsheetColumns';
import { buildInlineDiffRows, type InlineDiffCell } from '@/lib/runsheetInlineDiff';
import { resolveSiblings } from '@/lib/runsheetSiblings';
import { parseStartTimeFromRunsheetName } from '@/lib/runsheetTime';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { getViewModePreference, setViewModePreference, STORAGE_KEY_VIEW_MODE } from '@/lib/userPreferences';
import type { DynamicAttributeColumn, RunsheetDetails } from '@/types/Runsheet';
import { RichTextContent } from './RichTextContent';
import { RunsheetTableEditor as BaseRunsheetTableEditor } from './RunsheetTableEditor';

type Props = React.ComponentProps<typeof BaseRunsheetTableEditor>;

function label(name: string, fallback?: string) {
  return fallback || name.split('//').pop()?.trim() || name;
}

function checkIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') return window.matchMedia('(max-width: 767.98px)').matches;
  return window.innerWidth > 0 && window.innerWidth < 768;
}

function targetStart(details: RunsheetDetails) {
  if (details.startTime) return details.startTime;
  if (details.subtitle && /^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(details.subtitle.trim())) return details.subtitle.trim();
  return parseStartTimeFromRunsheetName(details.name);
}

function visibleColumns(columns: DynamicAttributeColumn[] | undefined, order: string[] | undefined) {
  const source = columns?.length ? columns : FALLBACK_RUNSHEET_COLUMNS;
  const hidden = new Set([...HIDDEN_ATTRIBUTE_KEYS, ...RESERVED_RUNSHEET_COLUMN_KEYS].map((key) => key.toUpperCase()));
  const filtered = source.filter((column) => !hidden.has(column.key.toUpperCase()));
  if (!order?.length) return filtered;
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...filtered].sort((a, b) => (rank.get(a.key) ?? 9999) - (rank.get(b.key) ?? 9999));
}

const START_WIDTH = 88;
const DURATION_WIDTH = 78;
const TITLE_WIDTH = 140;
const WIDE_COLUMN_WIDTH = 150;
const DEFAULT_COLUMN_WIDTH = 100;

/**
 * Width for one dynamic diff column, mirroring `getColumnStyle` in RunsheetTableEditor
 * so a column is not one width in the editor and another in the diff beside it.
 * Description / Notes / Main Instrument are the wide ones there; everything else
 * falls back to the default.
 */
function diffColumnWidth(column: DynamicAttributeColumn, widths?: Record<string, number>): number {
  // A user-resized column is persisted in initialColumnMetadata.widths and honoured
  // first by getColumnStyle; honour it here too, or a 220px Notes column in the
  // editor renders 150px in the diff beside it.
  const persisted = widths?.[column.key];
  if (persisted) return persisted;
  const upperKey = column.key.toUpperCase();
  const lowerName = (column.name || '').toLowerCase();
  const isWide =
    upperKey === 'DESCRIPTION' || upperKey === 'DETIAL' ||
    lowerName.includes('description') || lowerName.includes('detail') ||
    upperKey === 'MAININSTRUMENT' || upperKey === 'MAIN_INSTRUMENT' ||
    lowerName.includes('main instrument') || lowerName.includes('instrument') ||
    upperKey === 'PROGRAMNOTES' || upperKey === 'PROGRAM_NOTES' || upperKey === 'PROGRAM NOTES' ||
    upperKey === 'NOTES' || lowerName.includes('program note') || lowerName.includes('notes');
  return isWide ? WIDE_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
}

/** Total width the diff table needs before it is allowed to compress. */
function diffTableMinWidth(columns: DynamicAttributeColumn[], widths?: Record<string, number>): number {
  const start = widths?.start || widths?.START || START_WIDTH;
  const duration = widths?.duration || widths?.DURATION || DURATION_WIDTH;
  const title = widths?.title || widths?.ACTIVITYTITLE || TITLE_WIDTH;
  return start + duration + title +
    columns.reduce((total, column) => total + diffColumnWidth(column, widths), 0);
}

function Cell({ cell, mono = false }: { cell: InlineDiffCell; mono?: boolean }) {
  const render = (value: string) => mono ? <span className="font-mono font-semibold">{value}</span> : <RichTextContent value={value} />;
  if (cell.status === 'same') return <div data-diff-status="same" className="min-h-6 px-2 py-1">{render(cell.sourceValue)}</div>;
  return (
    <div data-diff-status={cell.status} className="flex min-h-7 flex-col gap-1 px-1.5 py-1">
      {(cell.status === 'changed' || cell.status === 'removed') && cell.sourceValue ? (
        <div data-diff-part="removed" className="flex gap-0.5 text-slate-400 line-through decoration-slate-300">
          <span>(</span><div className="min-w-0 flex-1">{render(cell.sourceValue)}</div><span>)</span>
        </div>
      ) : null}
      {(cell.status === 'changed' || cell.status === 'added') && cell.targetValue ? (
        <div data-diff-part="added" className="rounded border border-yellow-300 bg-yellow-100 px-1.5 py-0.5 text-slate-950">
          {render(cell.targetValue)}
        </div>
      ) : null}
    </div>
  );
}

function DiffFieldStacked({ labelText, cell, mono = false }: { labelText: string; cell: InlineDiffCell; mono?: boolean }) {
  const render = (value: string) => mono ? <span className="font-mono font-semibold">{value}</span> : <RichTextContent value={value} />;
  return (
    <div data-diff-field={labelText} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs">
      <div className="font-bold uppercase tracking-wider text-[10px] text-slate-500">{labelText}</div>
      <div data-diff-status={cell.status} className="flex min-h-6 flex-col gap-1">
        {(cell.status === 'changed' || cell.status === 'removed') && cell.sourceValue ? (
          <div data-diff-part="removed" className="flex gap-0.5 text-slate-400 line-through decoration-slate-300">
            <span>(</span><div className="min-w-0 flex-1">{render(cell.sourceValue)}</div><span>)</span>
          </div>
        ) : null}
        {(cell.status === 'changed' || cell.status === 'added') && cell.targetValue ? (
          <div data-diff-part="added" className="rounded border border-yellow-300 bg-yellow-100 px-1.5 py-0.5 text-slate-950 font-medium">
            {render(cell.targetValue)}
          </div>
        ) : null}
        {cell.status === 'same' && cell.sourceValue ? (
          <div data-diff-part="same" className="text-slate-800">
            {render(cell.sourceValue)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function rowHasChanges(row: { rowStatus: string; cells: Record<string, InlineDiffCell> }): boolean {
  if (row.rowStatus !== 'matched') return true;
  return Object.values(row.cells).some((c) => c.status !== 'same');
}

function DiffCards({
  rows,
  columns,
  targetLabel,
  changesOnly,
}: {
  rows: ReturnType<typeof buildInlineDiffRows>;
  columns: DynamicAttributeColumn[];
  targetLabel: string;
  changesOnly: boolean;
}) {
  const displayedRows = changesOnly ? rows.filter(rowHasChanges) : rows;

  return (
    <div data-testid="inline-service-diff-cards" className="flex flex-col gap-2">
      {displayedRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-500">
          No changes found between these runsheets.
        </div>
      ) : null}

      {displayedRows.map((row) => {
        const isTargetOnly = row.rowStatus === 'target-only';
        const isSourceOnly = row.rowStatus === 'source-only';

        // Timing fields
        const startChanged = row.cells.START?.status !== 'same';
        const durationChanged = row.cells.DURATION?.status !== 'same';
        const showStart = !changesOnly || startChanged;
        const showDuration = !changesOnly || durationChanged;

        // Title field
        const titleCell = row.cells.title;
        const titleChanged = titleCell?.status !== 'same';
        const showTitleField = !changesOnly || titleChanged;

        // Dynamic attribute columns
        const dynamicColsToRender = columns.filter((col) => {
          const cell = row.cells[col.key];
          if (!cell) return false;
          if (changesOnly) {
            return cell.status !== 'same';
          }
          // In All segments mode, render if cell has content or is changed
          return cell.status !== 'same' || !!cell.sourceValue;
        });

        return (
          <div
            key={row.key}
            data-testid="diff-card"
            data-row-status={row.rowStatus}
            className={`flex flex-col gap-2 rounded-xl border p-3 shadow-xs transition-all ${
              isTargetOnly
                ? 'border-yellow-300 bg-yellow-50/60'
                : isSourceOnly
                ? 'border-slate-300 bg-slate-50/80'
                : 'border-slate-200 bg-white'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  {row.cells.START?.targetValue || row.cells.START?.sourceValue || '00:00:00'}
                </span>
                {(row.cells.DURATION?.targetValue || row.cells.DURATION?.sourceValue) ? (
                  <span className="font-mono text-[11px] font-semibold text-slate-500">
                    ({row.cells.DURATION?.targetValue || row.cells.DURATION?.sourceValue})
                  </span>
                ) : null}
              </div>

              {/* Status Badge */}
              {isTargetOnly ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 uppercase tracking-wider border border-amber-300">
                  Added in {targetLabel}
                </span>
              ) : isSourceOnly ? (
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider border border-slate-300">
                  Absent in {targetLabel}
                </span>
              ) : (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Matched
                </span>
              )}
            </div>

            {/* Segment Title */}
            <h4 className="font-bold text-slate-900 text-xs sm:text-sm break-words whitespace-normal leading-tight my-0.5">
              {titleCell?.targetValue || titleCell?.sourceValue || 'Untitled Segment'}
            </h4>

            {/* Time fields (Start Time and Duration) */}
            {(showStart || showDuration) && (
              <div className="flex flex-col gap-1">
                {showStart && row.cells.START && (
                  <DiffFieldStacked labelText="Start Time" cell={row.cells.START} mono />
                )}
                {showDuration && row.cells.DURATION && (
                  <DiffFieldStacked labelText="Duration" cell={row.cells.DURATION} mono />
                )}
              </div>
            )}

            {/* Title field */}
            {showTitleField && titleCell && (
              <DiffFieldStacked labelText="Activity Title" cell={titleCell} />
            )}

            {/* Dynamic Attribute Fields (Songs, Platform, Talking Points / Description, Notes, etc.) */}
            {dynamicColsToRender.map((col) => {
              const cell = row.cells[col.key];
              if (!cell) return null;
              return (
                <DiffFieldStacked
                  key={col.key}
                  labelText={col.name || col.key}
                  cell={cell}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DiffView({
  source,
  target,
  targetLabel,
}: {
  source: Props;
  target: RunsheetDetails;
  targetLabel: string;
}) {
  const [viewMode, setViewMode] = useState<'cards' | 'grid'>(() => {
    if (typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEY_VIEW_MODE)) {
      return getViewModePreference();
    }
    return checkIsMobile() ? 'cards' : 'grid';
  });
  const [changesOnly, setChangesOnly] = useState(false);

  const columns = useMemo(
    () => visibleColumns(source.columns, source.initialColumnMetadata?.order),
    [source.columns, source.initialColumnMetadata?.order]
  );
  const widths = source.initialColumnMetadata?.widths;
  const rows = useMemo(
    () =>
      buildInlineDiffRows({
        sourceRows: source.initialItems,
        targetRows: target.items,
        targetChannelId: target.channelId,
        columns,
        sourceStartTime: source.initialStartTime || parseStartTimeFromRunsheetName(source.channelName),
        targetStartTime: targetStart(target),
      }),
    [source.initialItems, source.initialStartTime, source.channelName, target, columns]
  );

  const displayedTableRows = changesOnly ? rows.filter(rowHasChanges) : rows;

  return (
    <div data-testid="inline-service-diff-container" className="flex w-full min-w-0 flex-col gap-2.5">
      {/* Diff Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs shadow-sm">
        <div>
          <div className="font-bold text-slate-900">Diff: {label(source.channelName)} → {targetLabel}</div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            CURRENT is muted in parentheses · DIFF additions are yellow · comparison is read-only
          </div>
        </div>

        {/* View Controls: Filter Switch & Layout Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Changes only / All segments toggle switch */}
          <div
            role="group"
            aria-label="Filter segments"
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs"
          >
            <button
              type="button"
              aria-label="All segments"
              aria-pressed={!changesOnly}
              onClick={() => setChangesOnly(false)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 ${
                !changesOnly
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All segments
            </button>
            <button
              type="button"
              aria-label="Changes only"
              aria-pressed={changesOnly}
              onClick={() => setChangesOnly(true)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 ${
                changesOnly
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Changes only
            </button>
          </div>

          {/* Cards / Table layout toggle */}
          <div
            role="group"
            aria-label="Layout view mode"
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs"
          >
            <button
              type="button"
              aria-label="Card view"
              aria-pressed={viewMode === 'cards'}
              onClick={() => {
                setViewMode('cards');
                setViewModePreference('cards');
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 ${
                viewMode === 'cards'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              aria-label="Table view"
              aria-pressed={viewMode === 'grid'}
              onClick={() => {
                setViewMode('grid');
                setViewModePreference('grid');
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 ${
                viewMode === 'grid'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Render Card or Table View */}
      {viewMode === 'cards' ? (
        <DiffCards
          rows={rows}
          columns={columns}
          targetLabel={targetLabel}
          changesOnly={changesOnly}
        />
      ) : (
        <div data-testid="inline-service-diff-table" className="w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-300 bg-white shadow-xs">
          <table
            className="w-full table-fixed border-collapse text-[11px] text-slate-900"
            style={{ minWidth: `${diffTableMinWidth(columns, widths)}px` }}
          >
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="border-r border-slate-700 p-1" style={{ width: `${widths?.start || widths?.START || START_WIDTH}px` }}>Start</th>
                <th className="border-r border-slate-700 p-1" style={{ width: `${widths?.duration || widths?.DURATION || DURATION_WIDTH}px` }}>Duration</th>
                <th className="border-r border-slate-700 p-1" style={{ width: `${widths?.title || widths?.ACTIVITYTITLE || TITLE_WIDTH}px` }}>Activity Title</th>
                {columns.map((column) => (
                  <th key={column.key} className="border-r border-slate-700 p-1" style={{ width: `${diffColumnWidth(column, widths)}px` }}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedTableRows.map((row) => (
                <tr
                  key={row.key}
                  data-row-status={row.rowStatus}
                  className={`border-b border-slate-200 ${
                    row.rowStatus === 'target-only'
                      ? 'bg-yellow-50/60'
                      : row.rowStatus === 'source-only'
                      ? 'bg-slate-50'
                      : ''
                  }`}
                >
                  <td className="border-r border-slate-200"><Cell cell={row.cells.START} mono /></td>
                  <td className="border-r border-slate-200"><Cell cell={row.cells.DURATION} mono /></td>
                  <td className="border-r border-slate-200">
                    <Cell cell={row.cells.title} />
                    {row.rowStatus !== 'matched' ? (
                      <div className={`px-2 pb-1 text-[9px] font-bold uppercase ${row.rowStatus === 'target-only' ? 'text-amber-700' : 'text-slate-400'}`}>
                        {row.rowStatus === 'target-only' ? `Added in ${targetLabel}` : `Absent in ${targetLabel}`}
                      </div>
                    ) : null}
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className="border-r border-slate-200">
                      <Cell cell={row.cells[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RunsheetTableEditor(props: Props) {
  const [channels, setChannels] = useState<Array<{ id: number; name: string; time: string }>>([]);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [target, setTarget] = useState<RunsheetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;
    rockGetAvailableRunsheetChannels(false).then((result) => {
      if (!active) return;
      if (result.success) setChannels(result.channels);
      else setError(result.error || 'Could not load sibling services.');
    }).catch(() => active && setError('Could not load sibling services.'));
    return () => { active = false; };
  }, [props.channelId]);

  const siblings = useMemo(() => resolveSiblings(props.channelId, props.channelName, channels), [props.channelId, props.channelName, channels]);
  const selectedSibling = siblings.find((sibling) => sibling.channelId === targetId);
  const targetLabel = selectedSibling ? label(selectedSibling.name, selectedSibling.time) : target ? label(target.name) : '';

  const clear = () => {
    requestRef.current += 1;
    setTargetId(null); setTarget(null); setLoading(false); setError(null); setPickerOpen(false);
  };

  const choose = async (id: number) => {
    if (dirty) return;
    const request = ++requestRef.current;
    setTargetId(id); setTarget(null); setLoading(true); setError(null); setPickerOpen(false);
    try {
      const [result] = await rockGetRunsheetDetailsBatch([id]);
      if (request !== requestRef.current) return;
      if (!result?.success || !result.data) { setError(result?.error || 'Could not load selected service.'); setTargetId(null); return; }
      setTarget(result.data);
    } catch {
      if (request === requestRef.current) { setError('Could not load selected service.'); setTargetId(null); }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const activeDiff = !!target && !!targetId;
  const onDirty = (next: boolean) => { setDirty(next); props.onDirtyChange?.(next); };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      {siblings.length > 0 || error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-xs">
          <div role="group" aria-label="Inline service diff" className="inline-flex gap-2 sm:gap-0 sm:overflow-hidden sm:rounded-lg sm:border sm:border-slate-300">
            <button type="button" aria-label="Clear inline diff" disabled={!targetId} onClick={clear} className="h-11 min-w-11 rounded-lg border border-slate-300 bg-rose-50 px-2 sm:rounded-none sm:border-0 sm:border-r sm:border-slate-200 text-sm font-black text-rose-700 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-600 sm:h-7 sm:min-w-8">−</button>
            <button type="button" disabled={dirty || siblings.length === 0} onClick={() => setPickerOpen((open) => !open)} className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-[11px] sm:rounded-none sm:border-0 font-extrabold text-slate-800 disabled:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-600 sm:h-7 sm:px-3">Diff</button>
            <button type="button" aria-label="Choose service to diff" disabled={dirty || siblings.length === 0} onClick={() => setPickerOpen((open) => !open)} className="h-11 min-w-11 rounded-lg border border-slate-300 bg-emerald-50 px-2 sm:rounded-none sm:border-0 sm:border-l sm:border-slate-200 text-sm font-black text-emerald-700 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-600 sm:h-7 sm:min-w-8">+</button>
          </div>
          {loading ? <span className="text-[10px] font-semibold text-slate-500">Loading Diff…</span> : targetId && targetLabel ? <span className="rounded border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-bold">Diff vs {targetLabel}</span> : null}
          {dirty ? <span className="text-[10px] font-semibold text-slate-500">Save changes before diffing.</span> : null}
          {error ? <span className="text-[10px] font-semibold text-rose-700">{error}</span> : null}
          {pickerOpen ? <select aria-label="Diff against service" defaultValue="" onChange={(event) => { const id = Number(event.target.value); if (id) void choose(id); }} className="h-11 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 sm:h-7"><option value="" disabled>Choose service…</option>{siblings.map((sibling) => <option key={sibling.channelId} value={sibling.channelId}>{label(sibling.name, sibling.time)}</option>)}</select> : null}
        </div>
      ) : null}

      <div className={activeDiff ? 'hidden' : 'block'} aria-hidden={activeDiff || undefined}>
        <BaseRunsheetTableEditor {...props} readOnly={props.readOnly || targetId !== null} onDirtyChange={onDirty} />
      </div>
      {activeDiff ? <DiffView source={props} target={target} targetLabel={targetLabel} /> : null}
    </div>
  );
}
