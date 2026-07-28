/**
 * OData query parameters passed to the Rock REST API.
 *
 * `undefined` values are dropped by the fetch layer (`rockFetch`) rather than
 * serialized, which is why the value type is widened to include it. This alias
 * is the single source of truth for the param shape shared by the Rock fetch
 * layer and the object cache — it intentionally lives in a dependency-free,
 * non-`server-only` module so both sides can `import type` it without creating
 * a `rockFetch ↔ rockObjectCache` import cycle.
 */
export type RockQueryParams = Record<string, string | number | boolean | undefined>;
