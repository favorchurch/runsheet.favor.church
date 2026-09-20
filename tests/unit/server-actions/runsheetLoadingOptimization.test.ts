import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const viewerSession = {
  rolesMap: { viewer: ['viewer-1'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

describe('runsheet loading server behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewerSession);
  });

  it('keeps authorized runsheet channel and detail reads on the centralized cache path', async () => {
    mockRockGet.mockImplementation(async (url: string) => {
      if (url === '/ContentChannels') {
        return [{ Id: 42, Name: 'MNL Service // August 17, 2099 // 10AM' }];
      }
      if (url === '/ContentChannels/42') {
        return { Id: 42, Name: 'MNL Service // August 17, 2099 // 10AM', ContentChannelTypeId: 13 };
      }
      return [];
    });

    await rockGetAvailableRunsheetChannels();
    await rockGetRunsheetDetails(42);

    expect(mockRockGet).toHaveBeenCalledWith('/ContentChannels', expect.any(Object));
    expect(mockRockGet).toHaveBeenCalledWith('/ContentChannels/42');
    expect(mockRockGet.mock.calls.every(([, , noCache]) => noCache !== true)).toBe(true);
  });

  it('starts independent attributes and item reads together after channel lookup', async () => {
    let resolveAttributes!: (value: any[]) => void;
    let resolveItems!: (value: any[]) => void;
    let attributesStarted = false;
    let itemsStarted = false;

    mockRockGet.mockImplementation((url: string) => {
      if (url === '/ContentChannels/42') {
        return Promise.resolve({
          Id: 42,
          Name: 'MNL Service // August 17, 2099 // 10AM',
          ContentChannelTypeId: 13,
        });
      }
      if (url === '/Attributes') {
        attributesStarted = true;
        return new Promise((resolve) => {
          resolveAttributes = resolve;
        });
      }
      if (url === '/ContentChannelItems') {
        itemsStarted = true;
        return new Promise((resolve) => {
          resolveItems = resolve;
        });
      }
      return Promise.resolve([]);
    });

    const resultPromise = rockGetRunsheetDetails(42);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attributesStarted).toBe(true);
    expect(itemsStarted).toBe(true);

    resolveAttributes([]);
    resolveItems([]);
    await expect(resultPromise).resolves.toMatchObject({ success: true });
  });
});
