/**
 * Redis-backed object cache for Rock GET responses, with O(1) global invalidation.
 *
 * Cache keys are `<prefix>rock:object-cache:request:<sha256(req)>:v<version>`.
 * A single global version counter is kept in Redis; every cache key embeds the
 * current version. On any write, `bustRockObjectCache()` does one atomic `INCR`,
 * which instantly orphans every existing key (no scan-and-delete needed). The
 * version itself is cached in local memory for `ROCK_CACHE_VERSION_TTL_SECONDS`
 * so reads don't hit Redis just to look it up. Disabled when Redis is off or
 * `ROCK_CACHE_TTL_SECONDS <= 0`. See docs/caching.md.
 */
import 'server-only';

import { createHash } from 'crypto';
import {
  REDIS_KEY_PREFIX,
  ROCK_API_URL,
  ROCK_CACHE_DEBUG,
  ROCK_CACHE_TTL_SECONDS,
  ROCK_CACHE_VERSION_TTL_SECONDS,
} from '@/constants.server';
import { isRedisEnabled, redisCommand } from '@/server-actions/internal/redisClient';
import type { RockQueryParams } from '@/types/RockQueryParams';

const CACHE_NAMESPACE = `${REDIS_KEY_PREFIX}rock:object-cache`;
const CACHE_VERSION_KEY = `${CACHE_NAMESPACE}:version`;

let localVersionCache: { value: string; expiresAt: number } | null = null;

function logCacheDebug(...args: unknown[]) {
  if (ROCK_CACHE_DEBUG) {
    console.log('[rock-cache]', ...args);
  }
}

function isRockObjectCacheEnabled(): boolean {
  return Boolean(isRedisEnabled() && ROCK_CACHE_TTL_SECONDS > 0);
}

function normalizeRockParams(params?: RockQueryParams): Array<[string, string]> {
  return Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) {
        return aValue.localeCompare(bValue);
      }
      return aKey.localeCompare(bKey);
    });
}

/**
 * Build the version-independent request key: a SHA-256 digest over the base URL,
 * path, method, and *sorted* params, so two equivalent requests hash identically.
 */
export function buildRockObjectCacheRequestKey(
  url: string,
  method: string,
  params?: RockQueryParams
): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        baseUrl: ROCK_API_URL,
        url,
        method,
        params: normalizeRockParams(params),
      })
    )
    .digest('hex');

  return `${CACHE_NAMESPACE}:request:${digest}`;
}

async function getRockObjectCacheVersion(): Promise<string | null> {
  if (!isRockObjectCacheEnabled()) return null;

  const now = Date.now();
  if (localVersionCache && localVersionCache.expiresAt > now) {
    return localVersionCache.value;
  }

  const version = (await redisCommand<string>(['GET', CACHE_VERSION_KEY])) || '0';
  localVersionCache = {
    value: version,
    expiresAt: now + ROCK_CACHE_VERSION_TTL_SECONDS * 1000,
  };

  return version;
}

function buildVersionedCacheKey(requestKey: string, version: string): string {
  return `${requestKey}:v${version}`;
}

export async function readRockObjectCache(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  params?: RockQueryParams
): Promise<{ hit: boolean; value?: any }> {
  if (method !== 'GET' || !isRockObjectCacheEnabled()) {
    return { hit: false };
  }

  try {
    const version = await getRockObjectCacheVersion();
    if (version == null) return { hit: false };

    const requestKey = buildRockObjectCacheRequestKey(url, method, params);
    const cacheKey = buildVersionedCacheKey(requestKey, version);
    const raw = await redisCommand<string>(['GET', cacheKey]);

    if (raw == null) {
      logCacheDebug('miss', cacheKey);
      return { hit: false };
    }

    const envelope = JSON.parse(raw) as { value: any };
    logCacheDebug('hit', cacheKey);
    return { hit: true, value: envelope.value };
  } catch (error) {
    console.warn('[rock-cache] read failed', error);
    return { hit: false };
  }
}

export async function writeRockObjectCache(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  params: RockQueryParams | undefined,
  value: any
): Promise<void> {
  if (method !== 'GET' || !isRockObjectCacheEnabled()) return;

  try {
    const version = await getRockObjectCacheVersion();
    if (version == null) return;

    const requestKey = buildRockObjectCacheRequestKey(url, method, params);
    const cacheKey = buildVersionedCacheKey(requestKey, version);
    await redisCommand<string>([
      'SETEX',
      cacheKey,
      ROCK_CACHE_TTL_SECONDS,
      JSON.stringify({ value }),
    ]);
    logCacheDebug('store', cacheKey, `${ROCK_CACHE_TTL_SECONDS}s`);
  } catch (error) {
    console.warn('[rock-cache] write failed', error);
  }
}

/** Invalidate the entire object cache in O(1) by incrementing the global version key. Called after every Rock write. */
export async function bustRockObjectCache(): Promise<void> {
  if (!isRockObjectCacheEnabled()) return;

  try {
    const nextVersion = String((await redisCommand<number>(['INCR', CACHE_VERSION_KEY])) ?? 1);
    localVersionCache = {
      value: nextVersion,
      expiresAt: Date.now() + ROCK_CACHE_VERSION_TTL_SECONDS * 1000,
    };
    logCacheDebug('bust', `v${nextVersion}`);
  } catch (error) {
    console.warn('[rock-cache] bust failed', error);
  }
}
