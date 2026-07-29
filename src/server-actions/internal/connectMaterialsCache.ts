/**
 * Dedicated, long-lived Redis cache for the shared Connect Materials dataset.
 *
 * Connect materials are Rock `ContentChannelItems` (YouTube "series") that change
 * roughly every two weeks and are only edited through Manage Connect Materials.
 * Loading them per request means several sequential Rock REST round-trips, and the
 * general-purpose Rock object cache (`rockObjectCache.ts`) is invalidated in O(1)
 * on *every* Rock write anywhere in the app — so on a busy instance those reads are
 * evicted almost continuously and re-hit Rock.
 *
 * This cache sidesteps that: it stores the heavy, viewer-independent reads
 * (`/ContentChannelItems` with attributes + `/Campuses`) under a single fixed key
 * with a multi-day TTL, and is deliberately NOT wired to `bustRockObjectCache()`.
 * It is busted only by the Connect Materials save actions (create/update/delete),
 * which is exactly when the underlying data changes. Per-viewer filtering and the
 * date-window check still run fresh on every request against this cached raw data.
 *
 * Redis is optional: when it is off (or the TTL <= 0) every function degrades to a
 * cache miss / no-op, and callers fall back to reading Rock directly.
 */
import 'server-only';

import {
  CONNECT_MATERIALS_CACHE_TTL_SECONDS,
  REDIS_KEY_PREFIX,
  ROCK_CACHE_DEBUG,
} from '@/constants/server';
import { isRedisEnabled, redisCommand } from '@/server-actions/internal/redisClient';

/** The raw, viewer-independent Rock reads that back the Connect Materials load. */
export interface ConnectMaterialsDataset {
  items: unknown[];
  campuses: unknown[];
}

const CACHE_KEY = `${REDIS_KEY_PREFIX}connect:materials:dataset`;

function logCacheDebug(...args: unknown[]) {
  if (ROCK_CACHE_DEBUG) {
    console.log('[connect-materials-cache]', ...args);
  }
}

function isConnectMaterialsCacheEnabled(): boolean {
  return Boolean(isRedisEnabled() && CONNECT_MATERIALS_CACHE_TTL_SECONDS > 0);
}

/** Return the cached dataset, or `null` on miss / Redis off / any error. */
export async function readConnectMaterialsDataset(): Promise<ConnectMaterialsDataset | null> {
  if (!isConnectMaterialsCacheEnabled()) return null;

  try {
    const raw = await redisCommand<string>(['GET', CACHE_KEY]);
    if (raw == null) {
      logCacheDebug('miss', CACHE_KEY);
      return null;
    }

    const envelope = JSON.parse(raw) as { value: ConnectMaterialsDataset };
    logCacheDebug('hit', CACHE_KEY);
    return envelope.value;
  } catch (error) {
    console.warn('[connect-materials-cache] read failed', error);
    return null;
  }
}

/** Store the dataset with the configured multi-day TTL. No-op when the cache is off. */
export async function writeConnectMaterialsDataset(
  value: ConnectMaterialsDataset,
): Promise<void> {
  if (!isConnectMaterialsCacheEnabled()) return;

  try {
    await redisCommand<string>([
      'SETEX',
      CACHE_KEY,
      CONNECT_MATERIALS_CACHE_TTL_SECONDS,
      JSON.stringify({ value }),
    ]);
    logCacheDebug('store', CACHE_KEY, `${CONNECT_MATERIALS_CACHE_TTL_SECONDS}s`);
  } catch (error) {
    console.warn('[connect-materials-cache] write failed', error);
  }
}

/**
 * Invalidate the cache so the next read repopulates from Rock. Called by the
 * Connect Materials save actions (create/update/delete) — the only paths that
 * change the underlying data.
 */
export async function bustConnectMaterialsCache(): Promise<void> {
  if (!isConnectMaterialsCacheEnabled()) return;

  try {
    await redisCommand<number>(['DEL', CACHE_KEY]);
    logCacheDebug('bust', CACHE_KEY);
  } catch (error) {
    console.warn('[connect-materials-cache] bust failed', error);
  }
}
