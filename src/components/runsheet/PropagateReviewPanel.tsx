'use client';

import React from 'react';
import { HiXMark } from 'react-icons/hi2';
import { htmlToPlainText } from '@/lib/richText';
import type { CellChange, PropagationPlan } from '@/lib/runsheetPropagate';
import type { PropagationOutcome } from '@/lib/runsheetPropagateExecute';

interface PropagateReviewPanelProps {
  plan: PropagationPlan;
  /** One checkbox per change, applied uniformly to every matched sibling — not a per-service toggle. */
  onToggleGroup: (itemTitle: string, columnKey: string, nextSelected: boolean) => void;
  onApply: () => void;
  onClose: () => void;
  applying: boolean;
  outcomes?: PropagationOutcome[];
}

interface GroupedChange {
  itemTitle: string;
  columnName: string;
  columnKey: string;
  newValue: string;
  rows: { channelId: number; time: string; change: CellChange }[];
}

function groupByChange(plan: PropagationPlan): GroupedChange[] {
  const groups = new Map<string, GroupedChange>();

  for (const target of plan.targets) {
    for (const change of target.changes) {
      const key = `${change.itemTitle}::${change.columnKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          itemTitle: change.itemTitle,
          columnName: change.columnName,
          columnKey: change.columnKey,
          newValue: change.newValue,
          rows: [],
        });
      }
      groups.get(key)!.rows.push({ channelId: target.channel.channelId, time: target.channel.time, change });
    }
  }

  return Array.from(groups.values());
}

export function PropagateReviewPanel({ plan, onToggleGroup, onApply, onClose, applying, outcomes }: PropagateReviewPanelProps) {
  const groups = groupByChange(plan);
  const selectedCount = plan.targets.reduce((sum, t) => sum + t.changes.filter((c) => c.selected).length, 0);
  const targetCount = new Set(
    plan.targets.filter((t) => t.changes.some((c) => c.selected)).map((t) => t.channel.channelId),
  ).size;

  const outcomeFor = (channelId: number) => outcomes?.find((o) => o.channelId === channelId);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div
        role="region"
        aria-label="Propagate changes"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Apply changes to other services today</h3>
            <p className="mt-1 text-xs text-slate-600">
              Every change from your save is listed below. Check the ones you want applied — each checkbox applies
              that change to every matching service at once, not just one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Close without applying"
            aria-label="Close review"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {groups.map((group) => {
            const selectableRows = group.rows.filter((r) => r.change.status !== 'unmatched');
            const groupSelected = selectableRows.length > 0 && selectableRows.every((r) => r.change.selected);
            const groupKey = `${group.itemTitle}::${group.columnKey}`;
            // The segment name is itself a rich-text cell (ACTIVITYTITLE) — it
            // can carry the same <p>/<strong> markup as any other cell value.
            const plainItemTitle = htmlToPlainText(group.itemTitle) || group.itemTitle;

            return (
              <div key={groupKey} className="rounded-xl border border-slate-200">
                <label
                  className={`flex items-center gap-3 rounded-t-xl border-b border-slate-200 bg-slate-50 px-3 py-2 ${
                    selectableRows.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={groupSelected}
                    disabled={selectableRows.length === 0}
                    onChange={() => onToggleGroup(group.itemTitle, group.columnKey, !groupSelected)}
                    aria-label={`Apply ${plainItemTitle} ${group.columnName} to all services`}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-pink-700 focus:ring-pink-600 disabled:opacity-50"
                  />
                  <span className="text-xs font-bold text-slate-900">
                    {plainItemTitle} · {group.columnName}
                  </span>
                  <span className="ml-auto max-w-[45%] truncate text-xs font-semibold text-slate-700">
                    {htmlToPlainText(group.newValue) || '—'}
                  </span>
                </label>

                <div className="divide-y divide-slate-100">
                  {group.rows.map(({ channelId, time, change }) => {
                    const outcome = outcomeFor(channelId);
                    return (
                      <div key={`${channelId}-${change.columnKey}`} className="flex items-center gap-3 px-3 py-2 pl-9 text-xs">
                        <span className="w-16 shrink-0 font-mono font-bold text-slate-900">{time}</span>
                        {change.status === 'unmatched' && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            no matching segment — skipped
                          </span>
                        )}
                        {change.status === 'clean' && (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            matches old value
                          </span>
                        )}
                        {change.status === 'diverged' && (
                          <span
                            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                            title={`Currently "${htmlToPlainText(change.targetCurrentValue ?? '')}"`}
                          >
                            already different — will overwrite
                          </span>
                        )}
                        {outcome && !outcome.ok && (
                          <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            failed: {outcome.error}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onApply}
            disabled={selectedCount === 0 || applying}
            className="w-full rounded-lg bg-pink-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-pink-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying
              ? 'Applying…'
              : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'} to ${targetCount} service${targetCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
