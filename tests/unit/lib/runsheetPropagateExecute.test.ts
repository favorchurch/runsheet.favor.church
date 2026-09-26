import { executePropagationPlan } from '@/lib/runsheetPropagateExecute';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('@/server-actions/rockBulkSaveRunsheetItems');

function targetRow(id: number, title: string): RunsheetItemRow {
  return { id, title, order: 1, duration: 5, attributeValues: { NOTES: 'old' } };
}

describe('executePropagationPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends exactly one changedKeys write per selected cell, per target', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [{ clientId: 10, ok: true }] });

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true },
          changes: [
            {
              itemTitle: 'Welcome',
              columnKey: 'NOTES',
              columnName: 'Notes',
              newValue: 'new',
              sourcePreviousValue: 'old',
              targetCurrentValue: 'old',
              targetItemId: 10,
              status: 'clean',
              selected: true,
            },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]]]);
    await executePropagationPlan(plan, targetRows, []);

    expect(rockBulkSaveRunsheetItems).toHaveBeenCalledTimes(1);
    const [, items] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(10);
    expect(items[0].changedKeys).toEqual(['NOTES']);
    expect(items[0].attributeValues.NOTES).toBe('new');
  });

  it('skips a target entirely when it has no selected changes', async () => {
    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X', time: '11:30AM', preselected: true },
          changes: [
            {
              itemTitle: 'Welcome',
              columnKey: 'NOTES',
              columnName: 'Notes',
              newValue: 'new',
              sourcePreviousValue: 'old',
              targetCurrentValue: 'different',
              targetItemId: 10,
              status: 'diverged',
              selected: false,
            },
          ],
        },
      ],
    };

    await executePropagationPlan(plan, new Map([[2, [targetRow(10, 'Welcome')]]]), []);
    expect(rockBulkSaveRunsheetItems).not.toHaveBeenCalled();
  });

  it('reports a per-target failure without throwing and without affecting other targets', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock)
      .mockResolvedValueOnce({ success: true, results: [{ clientId: 10, ok: true }] })
      .mockRejectedValueOnce(new Error('Rock timeout'));

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', targetItemId: 10, status: 'clean', selected: true },
          ],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', targetItemId: 20, status: 'clean', selected: true },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, []);

    expect(outcomes.find((o) => o.channelId === 2)?.ok).toBe(true);
    expect(outcomes.find((o) => o.channelId === 3)?.ok).toBe(false);
    expect(outcomes.find((o) => o.channelId === 3)?.error).toContain('Rock timeout');
  });

  it('inserts a selected new row as a fresh item in the target', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    const sourceRow: RunsheetItemRow = { id: 99, title: 'Favor News', order: 3, duration: 5, attributeValues: { NOTES: 'n' } };
    const plan: PropagationPlan = {
      targets: [{
        channel: { channelId: 2, name: 'X // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true },
        changes: [{
          itemTitle: 'Favor News', columnKey: 'NEW_ROW', columnName: 'New Segment', newValue: 'Added segment',
          sourcePreviousValue: '', targetCurrentValue: null, targetItemId: null, status: 'added', selected: true,
          isNewRow: true, sourceRow,
        }],
      }],
    };

    const outcomes = await executePropagationPlan(plan, new Map([[2, []]]), []);
    const saved = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0][1] as RunsheetItemRow[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: 'Favor News', isNew: true, attributeValues: { NOTES: 'n' } });
    expect(typeof saved[0].id).toBe('string');
    expect(outcomes[0]).toMatchObject({ ok: true, appliedCount: 1 });
  });

  it('deletes the matched target row for a selected removal', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    const plan: PropagationPlan = {
      targets: [{
        channel: { channelId: 2, name: 'X // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true },
        changes: [{
          itemTitle: 'Favor News', columnKey: 'DELETED_ROW', columnName: 'Removed Segment', newValue: '',
          sourcePreviousValue: '', targetCurrentValue: null, targetItemId: 40, status: 'removed', selected: true,
          isDeletedRow: true,
        }],
      }],
    };

    const outcomes = await executePropagationPlan(plan, new Map([[2, [targetRow(40, 'Favor News')]]]), []);

    expect(rockBulkSaveRunsheetItems).toHaveBeenCalledWith(2, [], [40], []);
    expect(outcomes[0]).toMatchObject({ ok: true, appliedCount: 1 });
  });
});
