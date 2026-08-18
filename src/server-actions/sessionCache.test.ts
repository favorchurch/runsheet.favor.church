import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { REDIS_KEY_PREFIX } from '@/constants/server';
import { ROCK_CACHE_TTL_SECONDS } from '@/constants/server';
import { ROCK_FETCH_REVALIDATE_SECONDS } from '@/constants/server';
import { SESSION_TTL_SECONDS, setSessionCache, type CachedSession } from './sessionCache';
import { redisCommand } from './internal/redisClient';

jest.mock('./internal/redisClient', () => ({
  isRedisEnabled: jest.fn().mockReturnValue(true),
  redisCommand: jest.fn(),
}));

const mockRedisCommand = jest.mocked(redisCommand);

const cacheEntry: CachedSession = {
  contact: { id: 42 },
  rolesMap: {},
  access: {
    campusIds: [],
    connectLeaderGroupIds: [],
    regionalLeaderSections: [],
    clusterHeadSections: [],
    departmentHeadSections: [],
    runsheetCampuses: [],
  },
};

describe('session cache key', () => {
  beforeEach(() => {
    mockRedisCommand.mockClear();
  });

  it('runsheet-session-key-v4', async () => {
    await setSessionCache(42, cacheEntry);

    const command = mockRedisCommand.mock.calls[0]?.[0];
    expect(command?.[1]).toBe(`${REDIS_KEY_PREFIX}session:v4:42`);
  });

  it('caps the authorization cache TTL at five minutes', () => {
    expect(SESSION_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(ROCK_CACHE_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(ROCK_FETCH_REVALIDATE_SECONDS).toBeLessThanOrEqual(300);
  });
});
