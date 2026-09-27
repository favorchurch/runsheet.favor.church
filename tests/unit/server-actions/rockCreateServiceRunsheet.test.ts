import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockEnsureRunsheetTemplate } from '@/server-actions/rockEnsureRunsheetTemplate';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('server-only', () => ({}));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn(), rockPost: jest.fn() }));
jest.mock('@/server-actions/rockBulkSaveRunsheetItems', () => ({ rockBulkSaveRunsheetItems: jest.fn() }));
jest.mock('@/server-actions/rockEnsureRunsheetTemplate', () => ({ rockEnsureRunsheetTemplate: jest.fn() }));
jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({ rockGetRunsheetDetails: jest.fn() }));

const mockEnsure = jest.mocked(rockEnsureRunsheetTemplate);
const mockDetails = jest.mocked(rockGetRunsheetDetails);
const mockSave = jest.mocked(rockBulkSaveRunsheetItems);

const TITLE = 'MNL Crowne // October 4, 2026 // 10AM';

function savedItems(): RunsheetItemRow[] {
  return mockSave.mock.calls[0][1] as RunsheetItemRow[];
}

describe('rockCreateServiceRunsheet template population', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['MNL'] },
    } as any);
    jest.mocked(rockPost).mockResolvedValue(200);
  });

  it("copies the campus template's rows and blanks their sibling keys", async () => {
    mockEnsure.mockResolvedValue({ success: true, id: 7 });
    mockDetails.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 1, title: 'Welcome', order: 1, duration: 5, attributeValues: { SIBLINGKEY: 'abc', NOTES: 'hi' } },
          { id: 2, title: 'Favor News', order: 2, duration: 3, attributeValues: { SIBLINGKEY: 'def' } },
        ],
      },
    } as any);

    const res = await rockCreateServiceRunsheet(TITLE, 13);

    expect(res.success).toBe(true);
    expect(mockEnsure).toHaveBeenCalledWith('MNL');
    const items = savedItems();
    expect(items.map((i) => i.title)).toEqual(['Welcome', 'Favor News']);
    expect(items.every((i) => i.isNew && typeof i.id === 'string')).toBe(true);
    expect(items.map((i) => i.attributeValues?.SIBLINGKEY)).toEqual(['', '']);
    expect(items[0].attributeValues?.NOTES).toBe('hi');
    expect(items.map((i) => i.order)).toEqual([1, 2]);
  });

  it.each([
    ['ensure fails', () => mockEnsure.mockResolvedValue({ success: false, error: 'nope' })],
    ['load fails', () => {
      mockEnsure.mockResolvedValue({ success: true, id: 7 });
      mockDetails.mockResolvedValue({ success: false } as any);
    }],
    ['template is empty', () => {
      mockEnsure.mockResolvedValue({ success: true, id: 7 });
      mockDetails.mockResolvedValue({ success: true, data: { items: [] } } as any);
    }],
    ['ensure throws', () => mockEnsure.mockRejectedValue(new Error('boom'))],
  ])('falls back to the hardcoded default when %s', async (_label, arrange) => {
    arrange();

    const res = await rockCreateServiceRunsheet(TITLE, 13);

    expect(res.success).toBe(true);
    expect(savedItems()).toHaveLength(DEFAULT_RUNSHEET_TEMPLATE.length);
  });
});
