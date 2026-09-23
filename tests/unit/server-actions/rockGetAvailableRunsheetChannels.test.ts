import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

describe('rockGetAvailableRunsheetChannels', () => {
  it('never lists master template channels, even for all-campus users', async () => {
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['ALL'] },
    } as any);
    jest.mocked(rockGet).mockResolvedValue([
      { Id: 1, Name: 'MNL Crowne // October 4, 2099 // 10AM' },
      { Id: 2, Name: 'MNL // Runsheet Master Template' },
      { Id: 3, Name: 'Runsheet Master Template' },
    ]);

    const res = await rockGetAvailableRunsheetChannels(false);

    expect(res.success).toBe(true);
    expect(res.channels.map((c) => c.id)).toEqual([1]);
  });
});
