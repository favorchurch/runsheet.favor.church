/**
 * Lazy, fault-tolerant Redis client shared by the object cache and session cache.
 *
 * Redis is OPTIONAL: if REDIS_URL is unset the app degrades gracefully to its
 * in-memory caches. The client connects lazily on first use and every command is
 * wrapped so a Redis outage never throws into request handling — it just behaves
 * as a cache miss (returns null).
 */
import 'server-only';

import { createClient } from 'redis';
import { REDIS_URL } from '@/constants/server';

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: REDIS_URL });
    client.on('error', (err) => console.warn('[redis] client error:', err.message));
    client.connect().catch((err) => {
      console.warn('[redis] connect failed:', err.message);
      client = null;
    });
  }
  return client;
}

/** True when a REDIS_URL is configured; callers use this to pick Redis vs. in-memory paths. */
export function isRedisEnabled(): boolean {
  return Boolean(REDIS_URL);
}

/**
 * Run a raw Redis command (e.g. `['GET', key]`, `['SETEX', key, ttl, value]`).
 * Returns the result, or `null` if Redis is unavailable or the command fails —
 * callers treat `null` as a cache miss rather than an error.
 */
export async function redisCommand<T>(command: Array<string | number>): Promise<T | null> {
  const c = getClient();
  if (!c || !c.isReady) return null;
  try {
    const [cmd, ...args] = command;
    const result = (await c.sendCommand([cmd as string, ...args.map(String)])) as T;
    return result ?? null;
  } catch (error) {
    console.warn('[redis] command failed:', command[0], error);
    return null;
  }
}
