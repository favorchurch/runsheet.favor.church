import { buildPropagationPlan, type CellChange } from '@/lib/runsheetPropagate';
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
      [{ itemId: 1, itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
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
      [{ itemId: 1, itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
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
      [{ itemId: 1, itemTitle: 'Altar Call', columnKey: 'NOTES', columnName: 'Notes', newValue: 'New copy', previousValue: 'Old copy' }],
      matchResults,
      [target],
      columns,
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('unmatched');
    expect(change.targetCurrentValue).toBeNull();
    expect(change.selected).toBe(false);
  });

  it('includes person and platform columns — every real edit shows, regardless of column', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { PLATFORM: 'Jane Doe', 'LED WALL': 'Static slide' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [
        { itemId: 1, itemTitle: 'Welcome', columnKey: 'PLATFORM', columnName: 'Anchor / Preacher', newValue: 'John Smith', previousValue: 'Jane Doe' },
        { itemId: 1, itemTitle: 'Welcome', columnKey: 'LED WALL', columnName: 'LED / Live Screens', newValue: 'Countdown video', previousValue: 'Static slide' },
      ],
      matchResults,
      [target],
      columns,
    );

    const changes: CellChange[] = plan.targets[0].changes;
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.columnKey).sort()).toEqual(['LED WALL', 'PLATFORM']);
  });

  it('still excludes SIBLINGKEY — an internal bookkeeping attribute, never a real edit', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', {}),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemId: 1, itemTitle: 'Welcome', columnKey: 'SIBLINGKEY', columnName: 'Sibling Key', newValue: 'abc', previousValue: '' }],
      matchResults,
      [target],
      columns,
    );

    expect(plan.targets[0].changes).toEqual([]);
  });

  it('matches by row id, not title text, so a rename in the same save still finds its row', () => {
    // The row was matched under its pre-edit title "Welcome" (matchRows ran
    // against the old title since the target hasn't seen the rename yet),
    // but the candidate now carries the renamed title for display.
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { DESCRIPTION: 'old copy' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemId: 1, itemTitle: 'Welcome & Announcements', columnKey: 'DESCRIPTION', columnName: 'Description', newValue: 'new copy', previousValue: 'old copy' }],
      matchResults,
      [target],
      [...columns, { id: 3, key: 'DESCRIPTION', name: 'Description' }],
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('clean');
    expect(change.targetItemId).toBe(10);
  });

  it('includes an ACTIVITYTITLE change alongside other changes on the same renamed row', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { ACTIVITYTITLE: 'Welcome', DESCRIPTION: 'old copy' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [
        { itemId: 1, itemTitle: 'Welcome & Announcements', columnKey: 'ACTIVITYTITLE', columnName: 'Activity', newValue: 'Welcome & Announcements', previousValue: 'Welcome' },
        { itemId: 1, itemTitle: 'Welcome & Announcements', columnKey: 'DESCRIPTION', columnName: 'Description', newValue: 'new copy', previousValue: 'old copy' },
      ],
      matchResults,
      [target],
      [...columns, { id: 3, key: 'ACTIVITYTITLE', name: 'Activity' }, { id: 4, key: 'DESCRIPTION', name: 'Description' }],
    );

    const changes: CellChange[] = plan.targets[0].changes;
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.columnKey).sort()).toEqual(['ACTIVITYTITLE', 'DESCRIPTION']);
    expect(changes.every((c) => c.status !== 'unmatched')).toBe(true);
  });
});
