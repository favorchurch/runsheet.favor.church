import { buildPropagationPlan } from '@/lib/runsheetPropagate';
import type { RowMatch, MatchResult } from '@/lib/runsheetMatch';
import type { SiblingChannel } from '@/lib/runsheetSiblings';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, attrs: Record<string, string> = {}): RunsheetItemRow {
  return { id, title, order: id, duration: 5, attributeValues: attrs };
}

const target: SiblingChannel = { channelId: 2, name: 'MNL Crowne // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true };

const columns: DynamicAttributeColumn[] = [
  { id: 1, key: 'NOTES', name: 'Notes' },
  { id: 2, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
];

describe('buildPropagationPlan', () => {
  it('marks a target cell clean when it still holds the source pre-edit value', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { NOTES: 'Doors open 8:30' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
      matchResults,
      [target],
      columns,
    );

    expect(plan.targets[0].changes[0].status).toBe('clean');
    expect(plan.targets[0].changes[0].selected).toBe(true);
  });

  it('marks a target cell diverged when it holds something else, unselected', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { NOTES: 'Doors open 8:45' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
      matchResults,
      [target],
      columns,
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('diverged');
    expect(change.targetCurrentValue).toBe('Doors open 8:45');
    expect(change.selected).toBe(false);
  });

  it('marks a change unmatched when there is no target row, and does not read targetCurrentValue', () => {
    const unmatched: RowMatch = { sourceRow: row(1, 'Altar Call'), targetRow: null, via: 'none' };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [unmatched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Altar Call', columnKey: 'NOTES', columnName: 'Notes', newValue: 'New copy', previousValue: 'Old copy' }],
      matchResults,
      [target],
      columns,
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('unmatched');
    expect(change.targetCurrentValue).toBeNull();
    expect(change.selected).toBe(false);
  });

  it('excludes person-type columns from the plan entirely', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { PLATFORM: 'Jane Doe' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'PLATFORM', columnName: 'Anchor / Preacher', newValue: 'John Smith', previousValue: 'Jane Doe' }],
      matchResults,
      [target],
      columns,
    );

    expect(plan.targets[0].changes).toEqual([]);
  });
});
