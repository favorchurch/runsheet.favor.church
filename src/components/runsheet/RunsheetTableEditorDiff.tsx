'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FALLBACK_RUNSHEET_COLUMNS, HIDDEN_ATTRIBUTE_KEYS, RESERVED_RUNSHEET_COLUMN_KEYS } from '@/constants/runsheetColumns';
import { buildInlineDiffRows, type InlineDiffCell } from '@/lib/runsheetInlineDiff';
import { resolveSiblings } from '@/lib/runsheetSiblings';
import { parseStartTimeFromRunsheetName } from '@/lib/runsheetTime';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import type { DynamicAttributeColumn, RunsheetDetails } from '@/types/Runsheet';
import { RichTextContent } from './RichTextContent';
import { RunsheetTableEditor as BaseRunsheetTableEditor } from './RunsheetTableEditor';

type Props = React.ComponentProps<typeof BaseRunsheetTableEditor>;

function label(name: string, fallback?: string) {
  return fallback || name.split('//').pop()?.trim() || name;
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

function DiffTable({ source, target, targetLabel }: { source: Props; target: RunsheetDetails; targetLabel: string }) {
  const columns = useMemo(() => visibleColumns(source.columns, source.initialColumnMetadata?.order), [source.columns, source.initialColumnMetadata?.order]);
  const rows = useMemo(() => buildInlineDiffRows({
    sourceRows: source.initialItems,
    targetRows: target.items,
    targetChannelId: target.channelId,
    columns,
    sourceStartTime: source.initialStartTime || parseStartTimeFromRunsheetName(source.channelName),
    targetStartTime: targetStart(target),
  }), [source.initialItems, source.initialStartTime, source.channelName, target, columns]);

  return (
    <div data-testid="inline-service-diff-table" className="flex w-full min-w-0 flex-col gap-2.5">
      <div className="rounded-xl border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs shadow-sm">
        <div className="font-bold text-slate-900">Diff: {label(source.channelName)} → {targetLabel}</div>
        <div className="mt-0.5 text-[10px] font-semibold text-slate-500">CURRENT is muted in parentheses · DIFF additions are yellow · comparison is read-only</div>
      </div>
      <div className="w-full overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-xs">
        <table className="w-full min-w-full table-fixed border-collapse text-[11px] text-slate-900">
          <thead className="bg-slate-900 text-white"><tr>
            <th className="w-[88px] border-r border-slate-700 p-1">Start</th>
            <th className="w-[78px] border-r border-slate-700 p-1">Duration</th>
            <th className="w-[140px] border-r border-slate-700 p-1">Activity Title</th>
            {columns.map((column) => <th key={column.key} className="min-w-[100px] border-r border-slate-700 p-1">{column.name}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-row-status={row.rowStatus} className={`border-b border-slate-200 ${row.rowStatus === 'target-only' ? 'bg-yellow-50/60' : row.rowStatus === 'source-only' ? 'bg-slate-50' : ''}`}>
                <td className="border-r border-slate-200"><Cell cell={row.cells.START} mono /></td>
                <td className="border-r border-slate-200"><Cell cell={row.cells.DURATION} mono /></td>
                <td className="border-r border-slate-200">
                  <Cell cell={row.cells.title} />
                  {row.rowStatus !== 'matched' ? <div className={`px-2 pb-1 text-[9px] font-bold uppercase ${row.rowStatus === 'target-only' ? 'text-amber-700' : 'text-slate-400'}`}>{row.rowStatus === 'target-only' ? `Added in ${targetLabel}` : `Absent in ${targetLabel}`}</div> : null}
                </td>
                {columns.map((column) => <td key={column.key} className="border-r border-slate-200"><Cell cell={row.cells[column.key]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          <div role="group" aria-label="Inline service diff" className="inline-flex overflow-hidden rounded-lg border border-slate-300">
            <button type="button" aria-label="Clear inline diff" disabled={!targetId} onClick={clear} className="h-7 min-w-8 border-r border-slate-200 bg-rose-50 px-2 text-sm font-black text-rose-700 disabled:opacity-30">−</button>
            <button type="button" disabled={dirty || siblings.length === 0} onClick={() => setPickerOpen((open) => !open)} className="h-7 bg-white px-3 text-[11px] font-extrabold text-slate-800 disabled:text-slate-400">Diff</button>
            <button type="button" aria-label="Choose service to diff" disabled={dirty || siblings.length === 0} onClick={() => setPickerOpen((open) => !open)} className="h-7 min-w-8 border-l border-slate-200 bg-emerald-50 px-2 text-sm font-black text-emerald-700 disabled:opacity-30">+</button>
          </div>
          {loading ? <span className="text-[10px] font-semibold text-slate-500">Loading Diff…</span> : targetId && targetLabel ? <span className="rounded border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-bold">Diff vs {targetLabel}</span> : null}
          {dirty ? <span className="text-[10px] font-semibold text-slate-500">Save changes before diffing.</span> : null}
          {error ? <span className="text-[10px] font-semibold text-rose-700">{error}</span> : null}
          {pickerOpen ? <select aria-label="Diff against service" defaultValue="" onChange={(event) => { const id = Number(event.target.value); if (id) void choose(id); }} className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold"><option value="" disabled>Choose service…</option>{siblings.map((sibling) => <option key={sibling.channelId} value={sibling.channelId}>{label(sibling.name, sibling.time)}</option>)}</select> : null}
        </div>
      ) : null}

      <div className={activeDiff ? 'hidden' : 'block'} aria-hidden={activeDiff || undefined}>
        <BaseRunsheetTableEditor {...props} readOnly={props.readOnly || targetId !== null} onDirtyChange={onDirty} />
      </div>
      {activeDiff ? <DiffTable source={props} target={target} targetLabel={targetLabel} /> : null}
    </div>
  );
}
