import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockEnsureRunsheetTemplate } from '@/server-actions/rockEnsureRunsheetTemplate';

jest.mock('server-only', () => ({}));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn(), rockPost: jest.fn() }));
jest.mock('@/server-actions/rockBulkSaveRunsheetItems', () => ({ rockBulkSaveRunsheetItems: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockGet = jest.mocked(rockGet);
const mockPost = jest.mocked(rockPost);
const mockSave = jest.mocked(rockBulkSaveRunsheetItems);

function editor(campuses: string[]) {
  return { rolesMap: { editor: ['editor-1'] }, access: { runsheetCampuses: campuses } } as any;
}

describe('rockEnsureRunsheetTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue(editor(['MNL']));
  });

  it('returns the existing template, querying oldest-first by exact campus name', async () => {
    mockGet.mockResolvedValue([{ Id: 7 }]);

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res).toEqual({ success: true, id: 7 });
    const [url, params] = mockGet.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/ContentChannels');
    expect(params.$filter).toBe("ContentChannelTypeId eq 13 and Name eq 'MNL // Runsheet Master Template'");
    expect(params.$orderby).toBe('Id asc');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('creates and seeds the template when none exists', async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue(55);

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res).toEqual({ success: true, id: 55 });
    expect(mockPost).toHaveBeenCalledWith('/ContentChannels', expect.objectContaining({ Name: 'MNL // Runsheet Master Template' }));
    expect(mockSave).toHaveBeenCalledWith(55, expect.any(Array), []);
    expect((mockSave.mock.calls[0][1] as unknown[]).length).toBeGreaterThan(0);
  });

  it("denies an editor from another campus without touching Rock's channel list", async () => {
    mockSession.mockResolvedValue(editor(['BNE']));

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res.success).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalledWith('/ContentChannels', expect.anything());
  });

  it('lets an all-campus user reach any campus template', async () => {
    mockSession.mockResolvedValue(editor(['ALL']));
    mockGet.mockResolvedValue([{ Id: 9 }]);

    expect(await rockEnsureRunsheetTemplate('SEL')).toEqual({ success: true, id: 9 });
  });

  it('rejects an unknown campus code', async () => {
    const res = await rockEnsureRunsheetTemplate('XYZ' as any);
    expect(res.success).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
