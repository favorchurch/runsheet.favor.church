/** Shared upper bound for authorization-related cache staleness. */
export const MAX_AUTHORIZATION_CACHE_TTL_SECONDS = 300;

/** Parse and bound a cache TTL, falling back safely for malformed values. */
export function clampCacheTtlSeconds(
  rawValue: string | undefined,
  fallbackSeconds: number,
  minimumSeconds: number,
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallbackSeconds;

  return Math.min(MAX_AUTHORIZATION_CACHE_TTL_SECONDS, Math.max(minimumSeconds, parsed));
}
