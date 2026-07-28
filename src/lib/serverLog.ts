/**
 * Server-side logging seam.
 *
 * Before this module, server logging was a cross-cutting concern implemented
 * four different ways: an ungated per-request `console.log` in the Rock fetch
 * hot path, three hand-rolled `const DEBUG = (...) => console.*` helpers in
 * individual server actions, and one correctly-gated `logCacheDebug` in the
 * object cache. This generalizes that last (correct) pattern into one place.
 *
 * `serverLog(namespace)` returns a small logger whose `debug` output is gated
 * behind the `ROCK_DEBUG` env flag (mirroring `ROCK_CACHE_DEBUG`), while `warn`
 * and `error` always emit — problems must surface regardless of verbosity.
 *
 * `server-only` guarantees a build error if this is ever pulled into client
 * code; it reaches client-imported `'use server'` actions safely because Next
 * strips server modules at the RPC boundary.
 */
import 'server-only';

import { ROCK_DEBUG } from '@/constants.server';

type LogFn = (...args: unknown[]) => void;

export interface ServerLogger {
  /** Verbose, developer-facing tracing. Emitted only when `ROCK_DEBUG=true`. */
  debug: LogFn;
  /** Recoverable anomalies (e.g. an ignored idempotent 404). Always emitted. */
  warn: LogFn;
  /** Genuine failures. Always emitted. */
  error: LogFn;
}

/** Create a namespaced logger. The namespace is rendered as a `[ns]` prefix. */
export function serverLog(namespace: string): ServerLogger {
  const tag = `[${namespace}]`;
  return {
    debug: (...args) => {
      if (ROCK_DEBUG) console.debug(tag, ...args);
    },
    warn: (...args) => console.warn(tag, ...args),
    error: (...args) => console.error(tag, ...args),
  };
}

/**
 * Redact OData single-quoted string literals in a Rock URL so user-supplied
 * values (e.g. searched contact names in `substringof('Jane',LastName)`) never
 * land in logs, while preserving everything needed to diagnose a Rock 400:
 * field names, operators, `$select`, `$top`, and overall filter structure.
 *
 *   /People?$filter=substringof('Jane',LastName)  →  …substringof('***',LastName)
 *
 * Numeric identifiers (e.g. `PersonId eq 12345`) are deliberately left intact:
 * they are pseudonymous and materially useful when debugging.
 */
export function redactRockUrl(url: string): string {
  return url.replace(/'[^']*'/g, "'***'");
}

/** Truncate a long string for logging, appending an elision marker. */
export function truncateForLog(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}… [${value.length} chars]` : value;
}
