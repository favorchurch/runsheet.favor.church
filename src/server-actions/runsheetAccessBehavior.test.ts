import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';
import { rockDeleteServiceRunsheet } from './rockDeleteServiceRunsheet';
import { rockDuplicateServiceRunsheet } from './rockDuplicateServiceRunsheet';
import { rockBulkSaveRunsheetItems } from './rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from './rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from './rockGetRunsheetDetails';
import { rockSearchSongs } from './rockSearchSongs';
import { getRockContentChannelOptions } from './getRockContentChannelOptions';
import { rockGetScheduleOptions } from './rockGetScheduleOptions';
import { searchRockPeople } from './searchRockPeople';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockDelete = jest.mocked(rockDelete);

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function expectNoRockWrites() {
  expect(mockRockPost).not.toHaveBeenCalled();
  expect(mockRockPatch).not.toHaveBeenCalled();
  expect(mockRockDelete).not.toHaveBeenCalled();
}

describe('server-action access enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRockPost.mockResolvedValue(123);
    mockRockPatch.mockResolvedValue(null);
    mockRockDelete.mockResolvedValue(null);
    mockRockGet.mockResolvedValue([]);
  });

  it.each([
    ['viewer', session('MNL', false), 'MNL Service'],
    ['cross-campus editor', session('MNL', true), 'BNE Service'],
  ])('create rejects a %s before any Rock write', async (_label, principal, title) => {
    mockGetRockSession.mockResolvedValue(principal);

    const result = await rockCreateServiceRunsheet(`${title} // August 16, 2026 // 10AM`, 13);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('create accepts an editor on the title campus', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));

    const result = await rockCreateServiceRunsheet('MNL Service // August 16, 2026 // 10AM', 13);

    expect(result.success).toBe(true);
    expect(mockRockPost).toHaveBeenCalledWith(
      '/ContentChannels',
      expect.objectContaining({ ContentChannelTypeId: 13 }),
    );
  });

  it('create rejects a caller-supplied non-runsheet content channel type', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));

    const result = await rockCreateServiceRunsheet('MNL Service // August 16, 2026 // 10AM', 14);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it.each([
    ['viewer', session('MNL', false), 'MNL Service'],
    ['cross-campus editor', session('MNL', true), 'BNE Service'],
  ])('duplicate rejects a %s before any Rock write', async (_label, principal, title) => {
    mockGetRockSession.mockResolvedValue(principal);

    const result = await rockDuplicateServiceRunsheet(`${title} // August 16, 2026 // 10AM`);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('duplicate accepts an editor on the title campus', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));

    const result = await rockDuplicateServiceRunsheet('MNL Service // August 16, 2026 // 10AM');

    expect(result.success).toBe(true);
    expect(mockRockPost).toHaveBeenCalledWith(
      '/ContentChannels',
      expect.objectContaining({ ContentChannelTypeId: 13 }),
    );
  });

  it('duplicate rejects a caller-supplied non-runsheet content channel type', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));

    const result = await rockDuplicateServiceRunsheet(
      'MNL Service // August 16, 2026 // 10AM',
      14,
    );

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('rejects an ambiguous title even for an all-campus editor', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['global-editor'], viewer: ['global-editor'] },
      access: { runsheetCampuses: ['ALL'] },
    } as any);

    const createResult = await rockCreateServiceRunsheet('SEL Service (MNL Backup)', 13);
    const duplicateResult = await rockDuplicateServiceRunsheet('SEL Service (MNL Backup)');

    expect(createResult.success).toBe(false);
    expect(duplicateResult.success).toBe(false);
    expectNoRockWrites();
  });

  it.each([
    ['viewer', session('MNL', false), { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 }],
    ['cross-campus editor', session('MNL', true), { Name: 'BNE Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 }],
  ])('delete rejects a %s before any Rock write', async (_label, principal, channel) => {
    mockGetRockSession.mockResolvedValue(principal);
    mockRockGet.mockResolvedValue(channel);

    const result = await rockDeleteServiceRunsheet(42);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('rejects bulk save for a same-campus non-runsheet channel type', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(async (url) => {
      if (url.startsWith('/ContentChannels/')) {
        return {
          Name: 'MNL Not a Runsheet // August 17, 2026 // 10AM',
          ContentChannelTypeId: 99,
          ItemsManuallyOrdered: true,
        };
      }
      if (url === '/ContentChannelItems') return [];
      return [];
    });

    const result = await rockBulkSaveRunsheetItems(42, [], []);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('rejects delete for a same-campus non-runsheet channel type', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(async (url) =>
      url.startsWith('/ContentChannels/')
        ? { Name: 'MNL Not a Runsheet // August 17, 2026 // 10AM', ContentChannelTypeId: 99 }
        : [],
    );

    const result = await rockDeleteServiceRunsheet(42);

    expect(result.success).toBe(false);
    expectNoRockWrites();
  });

  it('delete accepts an editor on the channel campus', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockImplementation(async (url) =>
      url.startsWith('/ContentChannels/')
        ? { Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 }
        : [],
    );

    const result = await rockDeleteServiceRunsheet(42);

    expect(result.success).toBe(true);
    expect(mockRockDelete).toHaveBeenCalledTimes(1);
  });

  it('does not return upstream errors from duplicate', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockPost.mockRejectedValueOnce(new Error('Rock internal details'));

    const result = await rockDuplicateServiceRunsheet('MNL Service // August 16, 2026 // 10AM');

    expect(result).toEqual({ success: false, error: 'Failed to duplicate runsheet.' });
  });

  it('does not return upstream errors from delete', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet
      .mockResolvedValueOnce({ Name: 'MNL Service // August 16, 2026 // 10AM', ContentChannelTypeId: 13 })
      .mockRejectedValueOnce(new Error('Rock internal details'));

    const result = await rockDeleteServiceRunsheet(42);

    expect(result).toEqual({ success: false, error: 'Failed to delete runsheet.' });
  });

  it('rejects a forged string where delete expects a channel id', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true));

    const result = await rockDeleteServiceRunsheet('42 MNL' as unknown as number);

    expect(result.success).toBe(false);
    expectNoRockWrites();
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('keeps viewer-level runsheet content reads available', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockResolvedValue([]);

    expect((await rockSearchSongs('')).success).toBe(true);
    expect((await getRockContentChannelOptions()).success).toBe(true);
    expect((await rockGetScheduleOptions()).success).toBe(true);
  });

  it('rejects viewer-level reads for a principal without runsheet access', async () => {
    mockGetRockSession.mockResolvedValue({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);

    expect((await rockSearchSongs('')).success).toBe(false);
    expect((await getRockContentChannelOptions()).success).toBe(false);
    expect((await rockGetScheduleOptions()).success).toBe(false);
    expect((await rockGetAvailableRunsheetChannels()).success).toBe(false);
    expect((await rockGetRunsheetDetails(42)).success).toBe(false);
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('blocks a direct link to a runsheet outside the viewer campus', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockImplementation(async (url) =>
      url === '/ContentChannels/42'
        ? { Id: 42, Name: 'BNE Service // August 17, 2026 // 10AM', ContentChannelTypeId: 13 }
        : [],
    );

    const result = await rockGetRunsheetDetails(42);

    expect(result).toEqual({ success: false, error: 'You do not have access to this runsheet.' });
    expect(mockRockGet).toHaveBeenCalledTimes(1);
  });

  it('does not treat a same-campus non-runsheet channel as a runsheet detail', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockResolvedValue({
      Id: 42,
      Name: 'MNL Not a Runsheet // August 17, 2026 // 10AM',
      ContentChannelTypeId: 99,
    });

    const result = await rockGetRunsheetDetails(42);

    expect(result).toEqual({ success: false, error: 'Runsheet not found.' });
    expect(mockRockGet).toHaveBeenCalledTimes(1);
  });

  it('filters the channel list to the viewer campus', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockResolvedValue([
      { Id: 1, Name: 'MNL Service // August 17, 2026 // 10AM' },
      { Id: 2, Name: 'BNE Service // August 17, 2026 // 10AM' },
    ]);

    const result = await rockGetAvailableRunsheetChannels();

    expect(result.success).toBe(true);
    expect(result.channels.map((channel) => channel.id)).toEqual([1]);
  });

  it('does not let viewers include archived runsheets', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockResolvedValue([
      { Id: 1, Name: 'MNL Service // January 1, 2020 // 10AM' },
      { Id: 2, Name: 'MNL Service // December 31, 2099 // 10AM' },
    ]);

    const result = await rockGetAvailableRunsheetChannels(true);

    expect(result.success).toBe(true);
    expect(result.channels.map((channel) => channel.id)).toEqual([2]);
  });

  it('shows viewers every authorized-campus channel without roster filtering', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    mockRockGet.mockResolvedValue([
      { Id: 1, Name: 'MNL Service // August 17, 2026 // 10AM' },
      { Id: 2, Name: 'MNL Service // August 18, 2026 // 5PM' },
    ]);

    const result = await rockGetAvailableRunsheetChannels();

    expect(result.success).toBe(true);
    expect(result.channels).toHaveLength(2);
    expect(mockRockGet.mock.calls.some(([url]) => url === '/Attendances')).toBe(false);
  });

  it('rejects person search for viewers while allowing it for editors', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false));
    expect(await searchRockPeople('Al')).toEqual([]);
    expect(mockRockGet).not.toHaveBeenCalled();

    mockGetRockSession.mockResolvedValue(session('MNL', true));
    mockRockGet.mockResolvedValue([]);
    expect(await searchRockPeople('Al')).toEqual([]);
    expect(mockRockGet).toHaveBeenCalled();
  });

  it('fails closed when the Rock session cannot be resolved for person search', async () => {
    mockGetRockSession.mockRejectedValue(new Error('session lookup failed'));
    mockRockGet.mockResolvedValue([{ Id: 1, FirstName: 'Alice', LastName: 'Leak', Email: 'alice@example.com' }]);

    expect(await searchRockPeople('Al')).toEqual([]);
    expect(mockRockGet).not.toHaveBeenCalled();
  });
});
