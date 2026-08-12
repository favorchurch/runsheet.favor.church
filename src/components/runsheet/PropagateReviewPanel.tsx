'use client';

import React from 'react';
import type { CellChange, PropagationPlan } from '@/lib/runsheetPropagate';
import type { PropagationOutcome } from '@/lib/runsheetPropagateExecute';

interface PropagateReviewPanelProps {
  plan: PropagationPlan;
  onOverwrite: (targetChannelId: number, itemTitle: string, columnKey: string) => void;
  onApply: () => void;
  applying: boolean;
  outcomes?: PropagationOutcome[];
}

interface GroupedChange {
  itemTitle: string;
  columnName: string;
  rows: { channelId: number; time: string; change: CellChange }[];
}

function groupByChange(plan: PropagationPlan): GroupedChange[] {
  const groups = new Map<string, GroupedChange>();

  for (const target of plan.targets) {
    for (const change of target.changes) {
      const key = `${change.itemTitle}::${change.columnKey}`;
      if (!groups.has(key)) {
        groups.set(key, { itemTitle: change.itemTitle, columnName: change.columnName, rows: [] });
      }
      groups.get(key)!.rows.push({ channelId: target.channel.channelId, time: target.channel.time, change });
    }
  }

  return Array.from(groups.values());
}

export function PropagateReviewPanel({ plan, onOverwrite, onApply, applying, outcomes }: PropagateReviewPanelProps) {
  const groups = groupByChange(plan);
  const selectedCount = plan.targets.reduce((sum, t) => sum + t.changes.filter((c) => c.selected).length, 0);
  const targetCount = new Set(
    plan.targets.filter((t) => t.changes.some((c) => c.selected)).map((t) => t.channel.channelId),
  ).size;

  const outcomeFor = (channelId: number) => outcomes?.find((o) => o.channelId === channelId);

  return (
    <div className="propagate-review-panel" role="region" aria-label="Propagate changes">
      {groups.map((group) => (
        <div key={`${group.itemTitle}::${group.columnName}`} className="propagate-review-group">
          <div className="propagate-review-group-title">
            {group.itemTitle} · {group.columnName}
          </div>
          {group.rows.map(({ channelId, time, change }) => {
            const outcome = outcomeFor(channelId);
            return (
              <div key={`${channelId}-${change.columnKey}`} className="propagate-review-row">
                <span className="propagate-review-time">{time}</span>
                {change.status === 'unmatched' && (
                  <span className="propagate-review-skipped">no matching segment — skipped</span>
                )}
                {change.status === 'clean' && (
                  <span className="propagate-review-clean">{change.newValue}</span>
                )}
                {change.status === 'diverged' && (
                  <>
                    <span className="propagate-review-diverged">currently &quot;{change.targetCurrentValue}&quot;</span>
                    {!change.selected && (
                      <button
                        type="button"
                        onClick={() => onOverwrite(channelId, change.itemTitle, change.columnKey)}
                      >
                        Overwrite
                      </button>
                    )}
                  </>
                )}
                {outcome && !outcome.ok && <span className="propagate-review-error">failed: {outcome.error}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <div className="propagate-review-footer">
        <button type="button" onClick={onApply} disabled={selectedCount === 0 || applying}>
          {applying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'} to ${targetCount} service${targetCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
