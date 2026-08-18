import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { REDIS_KEY_PREFIX } from '@/constants/server';
import { ROCK_CACHE_TTL_SECONDS } from '@/constants/server';
import { ROCK_FETCH_REVALIDATE_SECONDS } from '@/constants/server';
import { getSessionCache, SESSION_TTL_SECONDS, sessionCacheKey, setSessionCache, type CachedSession } from './sessionCache';
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

  it('runsheet-session-key-v5', async () => {
    await setSessionCache(42, [42], cacheEntry);

    const command = mockRedisCommand.mock.calls[0]?.[0];
    expect(command?.[1]).toBe(`${REDIS_KEY_PREFIX}session:v5:42:none`);
  });

  it('gives two different id-sets sharing one primary id different cache keys; read and write use the same key (done-criteria 7)', async () => {
    const keyA = sessionCacheKey(42, [42, 101]);
    const keyB = sessionCacheKey(42, [42, 202]);
    expect(keyA).not.toBe(keyB);

    // Round-trip: a write under one union set is a hit on a read with that
    // same union set, because both derive the key through the same helper.
    let stored: string | null = null;
    mockRedisCommand.mockImplementation(async (command: unknown) => {
      const [op, key, , value] = command as [string, string, number, string];
      if (op === 'SETEX' && key === keyA) {
        stored = value;
        return 'OK' as never;
      }
      if (op === 'GET' && key === keyA) {
        return stored as never;
      }
      return null as never;
    });

    await setSessionCache(42, [42, 101], cacheEntry);
    const hit = await getSessionCache(42, [42, 101]);
    const missOnDifferentSet = await getSessionCache(42, [42, 202]);

    expect(hit).toEqual(cacheEntry);
    expect(missOnDifferentSet).toBeUndefined();
  });

  it('caps the authorization cache TTL at five minutes', () => {
    expect(SESSION_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(ROCK_CACHE_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(ROCK_FETCH_REVALIDATE_SECONDS).toBeLessThanOrEqual(300);
  });
});
