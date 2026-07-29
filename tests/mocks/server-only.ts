/**
 * Stands in for the `server-only` package.
 *
 * That module deliberately throws when bundled for the browser. Under Jest there
 * is no client bundle to protect, so importing it must be a no-op or every
 * module guarded by it would fail to load.
 */
export {};
