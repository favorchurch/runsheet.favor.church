/**
 * Hybrid session cache for resolved user authorization.
 *
 * Stores the `CachedSession` payload (Rock contact, role map, and accessible
 * sections/groups) keyed by Rock personId so `getRockSession` doesn't re-resolve
 * access from Rock on every request. Writes always hit the in-memory NodeCache;
 * when Redis is enabled they additionally read/write Redis with a TTL, so the
 * cache survives across serverless instances. Invalidated on logout/profile change.
 */
import 'server-only';

import NodeCache from 'node-cache';
import { REDIS_KEY_PREFIX } from '@/constants/server';
import { clampCacheTtlSeconds } from '@/lib/cacheTtl';
import { isRedisEnabled, redisCommand } from '@/server-actions/internal/redisClient';
import type { AuthAccess, AuthContact, AuthRolesMap } from '@/types/AuthUser';

/** Resolved authorization for a user, cached per Rock personId. */
export interface CachedSession {
  contact: AuthContact;
  rolesMap: AuthRolesMap;
  access: AuthAccess;
}

/** Authorization revocation window; never allow configuration to exceed five minutes. */
export const SESSION_TTL_SECONDS = Math.min(
  300,
  clampCacheTtlSeconds(process.env.SESSION_CACHE_TTL || '300', 300, 1),
);
const CHECK_PERIOD = 600;

const localCache = new NodeCache({ stdTTL: SESSION_TTL_SECONDS, checkperiod: CHECK_PERIOD });

function sessionCacheKey(personId: number): string {
  return `${REDIS_KEY_PREFIX}session:v4:${personId}`;
}

/** Read a cached session; falls back to Redis when enabled, otherwise in-memory only. Returns `undefined` on miss. */
export async function getSessionCache(personId: number): Promise<CachedSession | undefined> {
  const key = sessionCacheKey(personId);
  if (!isRedisEnabled()) {
    return localCache.get<CachedSession>(key);
  }

  try {
    const raw = await redisCommand<string>(['GET', key]);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as CachedSession;
    localCache.set(key, parsed);
    return parsed;
  } catch (error) {
    console.warn('[session-cache] read failed', error);
    return undefined;
  }
}

/** Write/refresh a cached session in both NodeCache and (if enabled) Redis with the <=5m TTL. */
export async function setSessionCache(personId: number, data: CachedSession): Promise<void> {
  const key = sessionCacheKey(personId);
  localCache.set(key, data);

  if (!isRedisEnabled()) {
    return;
  }

  try {
    await redisCommand(['SETEX', key, SESSION_TTL_SECONDS, JSON.stringify(data)]);
  } catch (error) {
    console.warn('[session-cache] write failed', error);
  }
}

/** Evict a cached session (logout / profile change) from NodeCache and Redis. */
export async function clearSessionCache(personId: number): Promise<void> {
  const key = sessionCacheKey(personId);
  localCache.del(key);

  if (!isRedisEnabled()) {
    return;
  }

  try {
    await redisCommand(['DEL', key]);
  } catch (error) {
    console.warn('[session-cache] delete failed', error);
  }
}
