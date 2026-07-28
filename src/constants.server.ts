/**
 * Server-only configuration constants.
 *
 * Everything here is read from environment variables and may contain secrets
 * (e.g. ROCK_API_KEY), so the `server-only` import guarantees a build error if
 * this module is ever imported into client code. Public, browser-safe config
 * lives in `constants.client.ts` instead.
 */
import 'server-only';

export const ROCK_API_KEY = process.env.ROCK_API_KEY || '';
export const ROCK_API_URL = process.env.NEXT_PUBLIC_ROCK_API_URL || process.env.ROCK_API_URL || '';
export const ROCK_FETCH_REVALIDATE_SECONDS = Number(process.env.ROCK_FETCH_REVALIDATE_SECONDS || '30');
export const ROCK_CACHE_TTL_SECONDS = Number(process.env.ROCK_CACHE_TTL_SECONDS || '30');
export const ROCK_CACHE_VERSION_TTL_SECONDS = Number(process.env.ROCK_CACHE_VERSION_TTL_SECONDS || '5');
export const ROCK_CACHE_DEBUG = process.env.ROCK_CACHE_DEBUG === 'true';
/**
 * Dedicated long-lived cache for Connect Materials (see connectMaterialsCache.ts).
 * Materials change roughly every 2 weeks and are only edited via Manage Connect
 * Materials, so this cache is intentionally decoupled from the global Rock-write
 * bust and lives far longer than the general object cache. Default 3 days.
 */
export const CONNECT_MATERIALS_CACHE_TTL_SECONDS = Number(
  process.env.CONNECT_MATERIALS_CACHE_TTL_SECONDS || String(60 * 60 * 24 * 3),
);
/** Gates verbose server-side debug logging (see `src/lib/serverLog.ts`). Off in production by default. */
export const ROCK_DEBUG = process.env.ROCK_DEBUG === 'true';
export const REDIS_URL = process.env.REDIS_URL || '';
/**
 * Derive the Redis key prefix so caches are isolated per environment/branch and
 * never collide. Honors an explicit REDIS_KEY_PREFIX, otherwise namespaces by
 * Vercel env: `connect:prod:`, `connect:preview:<branch>:`, or `connect:local:`.
 */
function deriveRedisKeyPrefix(): string {
  if (process.env.REDIS_KEY_PREFIX) return process.env.REDIS_KEY_PREFIX;
  const vercelEnv = process.env.VERCEL_ENV; // 'production' | 'preview' | undefined
  if (vercelEnv === 'production') return 'connect:prod:';
  if (vercelEnv === 'preview') {
    const branch = process.env.VERCEL_GIT_COMMIT_REF?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return branch ? `connect:preview:${branch}:` : 'connect:preview:';
  }
  return 'connect:local:';
}
export const REDIS_KEY_PREFIX = deriveRedisKeyPrefix();
export const REDIS_TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS || '1500');
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
export const ROCK_CONTENT_TYPE_ID = process.env.ROCK_CONTENT_TYPE_ID || '';
export const CHECKIN_NOTES = 'Checked-in via Connect Portal';
export const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
export const BLOB_URL_PREFIX = process.env.BLOB_URL_PREFIX || '';
