import { executePropagationPlan } from '@/lib/runsheetPropagateExecute';
import * as rockFetch from '@/server-actions/internal/rockFetch';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/permissions', () => ({ canUserEditRunsheet: jest.fn().mockReturnValue(true) }));

function targetRow(id: number, title: string): RunsheetItemRow {
  return { id, title, order: 1, duration: 5, attributeValues: { NOTES: 'old' } };
}

describe('propagation write path (integration)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues rockPost for AttributeValues per selected target, and none for an unselected target', async () => {
    const postCalls: { url: string; body: any }[] = [];
    (rockFetch.rockPost as jest.Mock) = jest.fn(async (url: string, body: any) => {
      postCalls.push({ url, body });
      return { Id: 999 };
    });
    (rockFetch.rockGet as jest.Mock) = jest.fn(async (url: string) => {
      if (url.includes('/ContentChannels/')) {
        const parts = url.split('/');
        const idStr = parts[parts.length - 1].split('?')[0];
        return { Id: parseInt(idStr, 10) || 2, ContentChannelTypeId: 13, ItemsManuallyOrdered: true };
      }
      if (url.includes('/Attributes')) {
        return [{ Id: 100, Key: 'NOTES', Name: 'Notes', FieldTypeId: 1 }];
      }
      if (url.includes('AttributeValues')) return [];
      return {};
    });

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true },
          ],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'different', status: 'diverged', selected: false },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, [{ id: 100, key: 'NOTES', name: 'Notes' }]);

    expect(outcomes.find((o) => o.channelId === 2)?.appliedCount).toBe(1);
    expect(outcomes.find((o) => o.channelId === 3)?.appliedCount).toBe(0);

    const attributePosts = postCalls.filter((c) => c.url.includes('AttributeValues'));
    expect(attributePosts.length).toBeGreaterThanOrEqual(1);
  });

  it('reports channel 3 as ok:false and leaves channel 2 ok:true when only channel 3 times out', async () => {
    (rockFetch.rockGet as jest.Mock) = jest.fn(async (url: string) => {
      if (url.includes('/ContentChannels/')) {
        const parts = url.split('/');
        const idStr = parts[parts.length - 1].split('?')[0];
        return { Id: parseInt(idStr, 10) || 2, ContentChannelTypeId: 13, ItemsManuallyOrdered: true };
      }
      if (url.includes('/Attributes')) {
        return [{ Id: 100, Key: 'NOTES', Name: 'Notes', FieldTypeId: 1 }];
      }
      if (url.includes('AttributeValues')) return [];
      return {};
    });
    (rockFetch.rockPost as jest.Mock) = jest.fn(async (url: string, body: any) => {
      if (body?.EntityId === 20) throw new Error('Rock timeout');
      return { Id: 999 };
    });

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true }],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true }],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, [{ id: 100, key: 'NOTES', name: 'Notes' }]);

    expect(outcomes.find((o) => o.channelId === 2)?.ok).toBe(true);
    expect(outcomes.find((o) => o.channelId === 3)?.ok).toBe(false);
  });
});
