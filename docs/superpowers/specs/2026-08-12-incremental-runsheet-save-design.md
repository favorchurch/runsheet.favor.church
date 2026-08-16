# Incremental Runsheet Save — Design

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Problem

Every click of Save sends the entire runsheet to Rock. `handleSave` in
`src/components/runsheet/RunsheetTableEditor.tsx` builds `preparedItems` from all
of `processedRows` plus every roster item, and `rockBulkSaveRunsheetItems` then
does, per row:

1. `PATCH /ContentChannelItems/{id}` (Title, Order, StartDateTime)
2. `GET /AttributeValues` to learn which attribute rows already exist
3. one `PATCH` or `POST /AttributeValues/{id}` per dynamic column (~8)

A 40-row sheet is therefore roughly 360 Rock calls even when the user changed a
single word. On prod this is slow and exposed to Cloudflare 524s and 60s read
timeouts, which are known to fire *after* a row has already persisted.

## Goal

Send only what actually changed, at cell granularity, and survive partial
failures without re-pushing the whole sheet.

## Non-goals

- No change to how the runsheet is loaded or rendered.
- No change to the duplicate-runsheet flow or the template auto-save; both keep
  using the existing full-write path.
- No change to how roster items (`title` starting with `Roster:`) are handled.

## Approach

Value-diff against a baseline snapshot, rather than bookkeeping a dirty-set at
each mutation site.

The alternative — marking rows dirty as they are edited — was rejected because
the runsheet has a time cascade: `processedRows` derives each row's
`calculatedStart` from the durations of all rows above it, so editing one row's
duration changes the `StartDateTime` that must be persisted for every row below
it, and a reorder or delete changes `Order` for the whole tail. An explicit
dirty-set would need cascade rules at every one of the ~15 `setIsDirty(true)`
call sites, and each new mutation site added later is a chance to forget one and
silently leave Rock stale. A diff cannot drift out of sync this way.

### 1. Baseline snapshot

The client holds `baselineRef: Map<itemId, Fingerprint>` — one entry per row,
representing that row *as it exists in Rock*.

`Fingerprint` is per-field, not a single row hash, so the changed-key set falls
out of the same comparison pass:

```
{ title, order, startDateTime, duration, songItemId, ...attributeValues }
```

The baseline is built once from the items the server provides on load, and
thereafter advanced only from confirmed save results (see §4).

`isDirty` becomes derived (`diff.length > 0`) instead of a flag. It keeps
driving the Save button's disabled state and the navigate-away guard exactly as
today. All existing `setIsDirty(true)` calls are removed.

### 2. Client-side bucketing

At save time, walk `processedRows` against the baseline and bucket each row:

| Bucket | Condition | Sent as |
|---|---|---|
| new | string `id`, or `isNew` | full create, no diff |
| changed | any content field differs | row + `changedKeys: [...]` |
| timing-only | only `order` / `startDateTime` differ | row + `changedKeys: []` |
| unchanged | nothing differs | omitted |

Deletions continue to flow through the existing `deletedIds` path.

The subtitle `PATCH /ContentChannels/{id}` fires only when the subtitle itself
changed, rather than on every save.

### 3. Server changes

`rockBulkSaveRunsheetItems` gains an optional `changedKeys: string[]` per item.

When `changedKeys` is present:

- `attributeColumns` is filtered to those keys before the write loop.
- `fetchExistingValueIds` queries only the corresponding attribute ids, and is
  skipped entirely when the filtered list is empty — so a timing-only row costs
  exactly one `PATCH /ContentChannelItems/{id}` and zero GETs.
- The item PATCH body carries only the item-level fields that changed.

`DURATION` and `SONGITEMID` are excluded from `attributeColumns` today and
written separately at the end of the loop; `changedKeys` gates those two writes
individually by the same keys, so they behave like any other column.

When `changedKeys` is absent, the current full-write path runs unchanged. This
is what keeps the duplicate and template-auto-save flows working untouched.

No new Rock capability is required: Rock's REST API is already per-attribute
(`PATCH /AttributeValues/{id}` with `{ Value }`), and
`PATCH /ContentChannelItems/{id}` already accepts a partial body. The batching
is entirely our own client-side loop.

### 4. Partial-failure handling

The return type becomes:

```ts
{ success: boolean; error?: string; results: ItemResult[] }

interface ItemResult {
  clientId: number | string;  // id the client sent
  rockId?: number;            // resolved Rock id (new rows included)
  ok: boolean;
  error?: string;
}
```

Each row's work already runs inside its own async map callback, so this is a
`try/catch` per callback plus `Promise.allSettled` in place of `Promise.all`.

The client advances the baseline only for rows with `ok: true`, mapping new
rows' string ids to their returned Rock ids. Failed rows keep their previous
baseline, remain dirty, and are picked up by the next Save.

Status messages report partial outcomes plainly — e.g. "Saved 12 of 14 segments;
2 failed, click Save to retry" — rather than a bare success. This matters
because Rock timeouts can fire after a row persisted; the retry is safe because
the next diff will simply find that row unchanged and omit it.

### 5. Testing

Unit tests on the diff function:

- A no-op save produces an empty payload.
- A single cell edit produces one row with exactly one changed key.
- A duration edit produces one changed row plus timing-only rows for everything
  below it.
- A reorder produces timing-only rows for the affected tail.

Server-action tests:

- An item with `changedKeys: []` issues no `AttributeValues` requests.
- An item with `changedKeys: ['ACTIVITYTITLE']` writes exactly that attribute.
- An item with `changedKeys` absent performs the full legacy write.

Integration:

- A partial failure leaves exactly the failed rows dirty, and the following save
  sends only those rows.

Existing `EventTeamRosterCard` tests are unaffected — roster items pass through
unchanged.

## Expected effect

| Edit | Rock calls before | after |
|---|---|---|
| one cell, 40-row sheet | ~360 | 1–2 |
| duration change at row 3 | ~360 | ~1 + one PATCH per row below |
| no-op save | ~360 | 0 |

## Files touched

- `src/components/runsheet/RunsheetTableEditor.tsx` — baseline ref, diff,
  derived `isDirty`, removal of `setIsDirty(true)` sites, partial-result status
- `src/server-actions/rockBulkSaveRunsheetItems.ts` — `changedKeys` filtering,
  per-row results
- `src/types/Runsheet.ts` — `changedKeys`, `ItemResult`
