import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetRunsheetDetails } from './rockGetRunsheetDetails';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPost: jest.fn(),
  rockPatch: jest.fn(),
  rockDelete: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const CHANNEL = {
  Id: 1,
  Name: 'MNL Service // August 16, 2026 // 10AM',
  ContentChannelTypeId: 13,
};

const ATTRIBUTES = [
  { Id: 10, Key: 'ACTIVITYTITLE', Name: 'Activity' },
  { Id: 11, Key: 'DESCRIPTION', Name: 'Detail', FieldTypeId: 1 },
  { Id: 12, Key: 'PLATFORM', Name: 'Anchor / Preacher', FieldTypeId: 18 },
];

/**
 * A runsheet is saved by writing `Value`. Rock refreshes `PersistedTextValue`
 * (its cached display text) separately, so a cell must be read from `Value` or a
 * saved edit can come back as its old text.
 */
describe('rockGetRunsheetDetails cell values', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue({
      rolesMap: { viewer: ['7001'] },
      access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: [] },
    } as any);
  });

  function loadWith(attributeValues: Record<string, unknown>) {
    mockRockGet.mockImplementation((async (url: string) => {
      if (url === '/ContentChannels/1') return CHANNEL;
      if (url === '/Attributes') return ATTRIBUTES;
      if (url === '/ContentChannelItems') {
        return [{ Id: 100, Title: 'Welcome', Order: 1, AttributeValues: attributeValues }];
      }
      return [];
    }) as any);
    return rockGetRunsheetDetails(1);
  }

  async function cell(attributeValues: Record<string, unknown>, key: string): Promise<string> {
    const result = await loadWith(attributeValues);
    expect(result.success).toBe(true);
    return result.data!.items[0].attributeValues[key];
  }

  it('reads the value the editor saved, not the lagging persisted text', async () => {
    await expect(
      cell({ DESCRIPTION: { Value: '<p>new notes</p>', PersistedTextValue: 'old notes' } }, 'DESCRIPTION'),
    ).resolves.toBe('<p>new notes</p>');
  });

  it('reads an emptied cell as empty instead of the old persisted text', async () => {
    await expect(
      cell({ DESCRIPTION: { Value: '', PersistedTextValue: 'old notes' } }, 'DESCRIPTION'),
    ).resolves.toBe('');
  });

  it('falls back to the persisted text only when there is no stored value at all', async () => {
    await expect(cell({ DESCRIPTION: { PersistedTextValue: 'only persisted' } }, 'DESCRIPTION')).resolves.toBe(
      'only persisted',
    );
  });

  it('still shows a person column as the readable name, not the stored alias GUID', async () => {
    await expect(
      cell(
        { PLATFORM: { Value: '0f8fad5b-d9cb-469f-a165-70867728950e', PersistedTextValue: 'Jane Doe' } },
        'PLATFORM',
      ),
    ).resolves.toBe('Jane Doe');
  });
});
