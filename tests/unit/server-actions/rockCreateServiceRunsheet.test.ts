import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
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
jest.mock('@/server-actions/rockGetRosterAssignments', () => ({
  rockGetRosterAssignments: jest.fn().mockResolvedValue({
    success: true,
    rockManaged: true,
    linked: true,
    scheduleId: 10,
    isoDate: '2026-10-04',
    roles: [],
  }),
}));

const mockEnsure = jest.mocked(rockEnsureRunsheetTemplate);
const mockDetails = jest.mocked(rockGetRunsheetDetails);
const mockSave = jest.mocked(rockBulkSaveRunsheetItems);
const mockGet = jest.mocked(rockGet);
const mockPost = jest.mocked(rockPost);

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

describe('rockCreateServiceRunsheet skipIfExists option', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['MNL'] },
    } as any);
    mockPost.mockResolvedValue(200);
    mockEnsure.mockResolvedValue({ success: true, id: 7 });
    mockDetails.mockResolvedValue({ success: true, data: { items: [] } } as any);
  });

  it('skips creation and returns skipped: true when channel with same name already exists', async () => {
    mockGet.mockResolvedValue([{ Id: 42 }]);

    const res = await rockCreateServiceRunsheet(TITLE, 13, undefined, { skipIfExists: true });

    expect(res).toEqual({ success: true, skipped: true });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('/ContentChannels', {
      $filter: `ContentChannelTypeId eq 13 and Name eq '${TITLE}'`,
      $select: 'Id',
      $top: 1,
    });
  });

  it('creates normally when skipIfExists is true but no channel matches', async () => {
    mockGet.mockResolvedValue([]);

    const res = await rockCreateServiceRunsheet(TITLE, 13, undefined, { skipIfExists: true });

    expect(res.success).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(mockPost).toHaveBeenCalledWith('/ContentChannels', expect.objectContaining({ Name: TITLE }));
  });

  it('does not make a lookup GET when options are not provided or skipIfExists is false', async () => {
    const resNoOptions = await rockCreateServiceRunsheet(TITLE, 13);
    expect(resNoOptions.success).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);

    mockPost.mockClear();
    const resFalse = await rockCreateServiceRunsheet(TITLE, 13, undefined, { skipIfExists: false });
    expect(resFalse.success).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("escapes apostrophes in the title using OData '' doubling during lookup", async () => {
    const titleWithApostrophe = "MNL Crowne // Father's Day // 10AM";
    mockGet.mockResolvedValue([{ Id: 55 }]);

    const res = await rockCreateServiceRunsheet(titleWithApostrophe, 13, undefined, { skipIfExists: true });

    expect(res).toEqual({ success: true, skipped: true });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('/ContentChannels', {
      $filter: "ContentChannelTypeId eq 13 and Name eq 'MNL Crowne // Father''s Day // 10AM'",
      $select: 'Id',
      $top: 1,
    });
  });

  it('rejects an unauthorized title before any Rock call, even with skipIfExists', async () => {
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['BNE'] },
    } as any);

    const res = await rockCreateServiceRunsheet(TITLE, 13, undefined, { skipIfExists: true });

    expect(res.success).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

