/**
 * Turns a reviewed PropagationPlan into writes. A propagated cell is exactly
 * a one-key changedKeys row, so this reuses rockBulkSaveRunsheetItems's cheap
 * path rather than a new write action. Runs per target under
 * Promise.allSettled so one Rock timeout can't take down the others; retry
 * is just calling this again with a freshly-built plan.
 */
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

export interface PropagationOutcome {
  channelId: number;
  channelName: string;
  ok: boolean;
  error?: string;
  appliedCount: number;
}

export async function executePropagationPlan(
  plan: PropagationPlan,
  targetRowsByChannel: Map<number, RunsheetItemRow[]>,
  columns: DynamicAttributeColumn[],
): Promise<PropagationOutcome[]> {
  const results = await Promise.allSettled(
    plan.targets.map(async ({ channel, changes }) => {
      const selected = changes.filter((c) => c.selected);
      if (selected.length === 0) {
        return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: 0 };
      }

      const targetRows = targetRowsByChannel.get(channel.channelId) || [];
      // Grouped by the target row's own id, not title text — a title edit
      // riding along in the same save must not break finding its row here.
      const changesByTargetItemId = new Map<number, typeof selected>();
      for (const change of selected) {
        if (change.targetItemId === null) continue;
        changesByTargetItemId.set(change.targetItemId, [...(changesByTargetItemId.get(change.targetItemId) || []), change]);
      }

      const itemsToSave: RunsheetItemRow[] = [];
      for (const [targetItemId, itemChanges] of changesByTargetItemId) {
        const targetRow = targetRows.find((r) => r.id === targetItemId);
        if (!targetRow || typeof targetRow.id !== 'number') continue;

        const attributeValues = { ...targetRow.attributeValues };
        const changedKeys: string[] = [];
        for (const change of itemChanges) {
          attributeValues[change.columnKey] = change.newValue;
          changedKeys.push(change.columnKey);
        }

        itemsToSave.push({ ...targetRow, attributeValues, changedKeys });
      }

      if (itemsToSave.length === 0) {
        return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: 0 };
      }

      const res = await rockBulkSaveRunsheetItems(channel.channelId, itemsToSave, [], columns);
      if (!res.success) throw new Error(res.error || 'Save failed');

      return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: itemsToSave.length };
    }),
  );

  return results.map((result, i) => {
    const channel = plan.targets[i].channel;
    if (result.status === 'fulfilled') return result.value;
    return {
      channelId: channel.channelId,
      channelName: channel.name,
      ok: false,
      error: result.reason?.message || 'Unknown error',
      appliedCount: 0,
    };
  });
}
