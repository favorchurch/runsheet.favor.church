import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { redisCommand, isRedisEnabled } from '@/server-actions/internal/redisClient';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';
import { rockSyncGrowRunsheets, resetGrowSyncLockForTests } from './rockSyncGrowRunsheets';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/server-actions/internal/redisClient', () => ({ redisCommand: jest.fn(), isRedisEnabled: jest.fn() }));
jest.mock('./rockCreateServiceRunsheet', () => ({ rockCreateServiceRunsheet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockGet = jest.mocked(rockGet);
const mockCreate = jest.mocked(rockCreateServiceRunsheet);
const mockRedisEnabled = jest.mocked(isRedisEnabled);

const ical = 'BEGIN:VEVENT\r\nDTSTART:20991006T190000\r\nRDATE:20991013T190000\r\nEND:VEVENT';

beforeEach(() => {
  jest.resetAllMocks();
  resetGrowSyncLockForTests();
  mockRedisEnabled.mockReturnValue(false);
  mockCreate.mockResolvedValue({ success: true, id: 1 } as any);
  mockGet.mockImplementation((async (url: string) => {
    if (url === '/Schedules') return [{ Id: 477, Name: 'MNL Grow - Bible Essentials', iCalendarContent: ical }];
    if (url === '/ContentChannels') return [{ Name: 'MNL Grow - Bible Essentials // October 6, 2099 // 7PM' }];
    return [];
  }) as any);
});

describe('rockSyncGrowRunsheets', () => {
  it('does nothing for a user who cannot edit', async () => {
    mockSession.mockResolvedValue({ rolesMap: { viewer: ['1'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('creates only the missing occurrence in category 338', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 1 });
    expect(mockCreate).toHaveBeenCalledWith('MNL Grow - Bible Essentials // October 13, 2099 // 7PM', 13, 338);
  });

  it('skips while another sync holds the lock', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    await rockSyncGrowRunsheets();
    mockCreate.mockClear();
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('uses Redis SET NX when Redis is enabled', async () => {
    mockRedisEnabled.mockReturnValue(true);
    jest.mocked(redisCommand).mockResolvedValue(null as any);
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
  });
});
