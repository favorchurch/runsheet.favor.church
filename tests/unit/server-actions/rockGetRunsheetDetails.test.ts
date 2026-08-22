import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const viewerSession = {
  rolesMap: { viewer: ['viewer-1'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

describe('rockGetRunsheetDetails column metadata & ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewerSession);
  });

  it('parses ChannelUrl into columnMetadata and sorts columns accordingly', async () => {
    const columnMetadata = {
      order: ['LIGHTING', 'PLATFORM', 'DESCRIPTION'],
      widths: { LIGHTING: 110, PLATFORM: 130, DESCRIPTION: 160 },
    };

    mockRockGet.mockImplementation(async (url: string) => {
      if (url === '/ContentChannels/42') {
        return {
          Id: 42,
          Name: 'MNL Service // August 17, 2099 // 10AM',
          ContentChannelTypeId: 13,
          ChannelUrl: JSON.stringify(columnMetadata),
        };
      }
      if (url === '/Attributes') {
        return [
          { Id: 1, Key: 'DESCRIPTION', Name: 'Detail', FieldTypeId: 1 },
          { Id: 2, Key: 'PLATFORM', Name: 'Platform', FieldTypeId: 18 },
          { Id: 3, Key: 'LIGHTING', Name: 'Lighting', FieldTypeId: 1 },
          { Id: 4, Key: 'AUDIO', Name: 'Audio', FieldTypeId: 1 },
        ];
      }
      if (url === '/ContentChannelItems') {
        return [];
      }
      return [];
    });

    const result = await rockGetRunsheetDetails(42);

    expect(result.success).toBe(true);
    expect(result.data?.columnMetadata).toEqual(columnMetadata);

    // Columns should be sorted: LIGHTING, PLATFORM, DESCRIPTION, and AUDIO (unlisted, at end)
    const columnKeys = result.data?.columns.map((c) => c.key);
    expect(columnKeys).toEqual(['LIGHTING', 'PLATFORM', 'DESCRIPTION', 'AUDIO']);

    // Check custom widths attached
    const lightingCol = result.data?.columns.find((c) => c.key === 'LIGHTING');
    expect(lightingCol?.width).toBe(110);
  });

  it('handles corrupt or empty ChannelUrl gracefully without breaking column loading', async () => {
    mockRockGet.mockImplementation(async (url: string) => {
      if (url === '/ContentChannels/42') {
        return {
          Id: 42,
          Name: 'MNL Service // August 17, 2099 // 10AM',
          ContentChannelTypeId: 13,
          ChannelUrl: '{invalid-json',
        };
      }
      if (url === '/Attributes') {
        return [
          { Id: 1, Key: 'DESCRIPTION', Name: 'Detail', FieldTypeId: 1 },
          { Id: 2, Key: 'PLATFORM', Name: 'Platform', FieldTypeId: 18 },
        ];
      }
      if (url === '/ContentChannelItems') {
        return [];
      }
      return [];
    });

    const result = await rockGetRunsheetDetails(42);

    expect(result.success).toBe(true);
    expect(result.data?.columnMetadata).toBeUndefined();
    expect(result.data?.columns.map((c) => c.key)).toEqual(['DESCRIPTION', 'PLATFORM']);
  });
});
