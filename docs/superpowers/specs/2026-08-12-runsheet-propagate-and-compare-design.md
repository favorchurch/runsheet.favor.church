# Runsheet Propagation & Side-by-Side Compare — Design

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning
**Depends on:** `2026-08-12-incremental-runsheet-save-design.md` — this design consumes
the per-field `Fingerprint` diff and the `changedKeys` write path introduced there.
That work must land first.

## Problem

A Sunday at one campus is four services, and their runsheets are near-identical
apart from the platform/people cells. When one aspect of the service changes —
announcement copy, a segment's duration, a note to the tech team — it has to be
retyped into all four sheets by hand. There is also no way to see the four sheets
against each other, so a structural drift (11:30AM missing a segment the other
three have) is only found by reading them one at a time.

## Goal

1. After editing one runsheet, apply the same changes to the other services on
   the same date at the same campus, with an explicit review step.
2. View 2–4 runsheets side by side with differences highlighted, and push
   individual cells across from there.

## Non-goals

- No simultaneous editing of two runsheets. `RunsheetTableEditor` is ~2000 lines
  of single-runsheet assumptions (one `baselineRef`, one save handler, one
  unsaved-changes guard); a split-pane editable view means lifting all of that
  out, and nothing in the workflow requires it. The compare view is read-only
  apart from the push action.
- No cross-campus and no cross-date propagation in v1 (see "Target resolution").
- No propagation of person/platform columns. These are per-service by nature.
- No change to how runsheets are loaded, created, or duplicated, beyond stamping
  the sibling key.

## Architecture

Both features are the same pipeline with different inputs:

```
source diff  ─┐
              ├─→ plan builder ─→ PropagationPlan ─→ review panel ─→ executor
target rows  ─┘
```

Save-time propagation feeds the plan builder the session's diff. The compare view
feeds it a synthetic diff — "every cell where this sheet differs from that one" —
scoped to the single cell being pushed. The plan type, the review UI, and the
executor are shared.

Three new pure modules sit underneath both surfaces.

### `src/lib/runsheetSiblings.ts` — target resolution

```ts
interface SiblingChannel {
  channelId: number;
  name: string;
  time: string;        // "11:30AM", parsed from the title's third segment
  preselected: boolean;
}

function resolveSiblings(
  sourceName: string,
  allChannels: RunsheetChannelOption[],
): SiblingChannel[]
```

Channel names follow `{campus} // {date} // {time}` (see `generateRunsheetTitle`).
Reuses the existing `extractChannelDate` and the campus prefix to select channels
with the same campus and the same date and a different time. Archived channels are
excluded.

v1 returns only same-campus siblings, all `preselected: true`. The `preselected`
flag exists so that a future "same date, other campuses" option is a change to the
filter alone — the review and execution path already handles a partially-selected
candidate list.

### `src/lib/runsheetMatch.ts` — row correspondence

```ts
interface Match {
  sourceRow: RunsheetItemRow;
  targetRow: RunsheetItemRow | null;
  via: 'siblingKey' | 'title' | 'none';
}

interface MatchResult {
  matches: Match[];
  backfill: { channelId: number; itemId: number; key: string }[];
}
```

Resolution order:

1. **`SIBLINGKEY`** — a shared UUID attribute (see "Sibling key"). Exact, survives
   renames and reordering.
2. **Unique title match** — a source row whose title matches exactly one target
   row. Ambiguous titles (a bare "Song" appearing four times) do *not* match.
3. **`none`** — surfaced in the review panel as a skipped row rather than guessed at.

Every title match also emits a `backfill` entry for both sides, so the first
propagation between two sheets stamps their shared key and all later matches are
`siblingKey` matches. Existing runsheets heal themselves; no migration script.

### `src/lib/runsheetPropagate.ts` — plan builder

```ts
type CellStatus = 'clean' | 'diverged' | 'unmatched';

interface CellChange {
  itemTitle: string;
  columnKey: string;
  columnName: string;
  newValue: string;
  sourcePreviousValue: string;
  targetCurrentValue: string | null;
  status: CellStatus;
  selected: boolean;
}

interface PropagationPlan {
  targets: { channel: SiblingChannel; changes: CellChange[] }[];
}
```

Status is decided per cell:

- `clean` — the target still holds `sourcePreviousValue`, i.e. it was in sync
  before this edit. Ticked by default.
- `diverged` — the target holds something else; someone customised it. **Not**
  ticked, and cannot be ticked without an explicit per-cell Overwrite action.
- `unmatched` — no counterpart row. Not actionable.

Columns are filtered before the plan is built, not at render time, so an excluded
column cannot leak through either surface:

- person-type columns (`fieldTypeId === ROCK_PERSON_FIELD_TYPE_ID`, 18)
- the platform columns (`anchorPreacher`, `mainInstrument`, `ledLiveScreens`,
  `overlayBroadcast`, `lighting`, `audio`)
- `SIBLINGKEY` itself

## Sibling key

A new item attribute `SIBLINGKEY` on ContentChannelType 13, holding a UUID shared
by corresponding rows across sibling runsheets.

- **New rows** generate a UUID on creation.
- **Duplication** inherits it for free: `rockDuplicateServiceRunsheet` already
  spreads `...row` when cloning items, so sheets created by duplication are
  lineage-matched from birth.
- **Existing rows** are stamped by the matcher's `backfill` output on first
  propagation.

Grid columns are discovered at runtime from the channel's item attributes, so
`SIBLINGKEY` would otherwise render as a visible column. A `HIDDEN_ATTRIBUTE_KEYS`
set is applied where `columns` is built, alongside the existing special-casing of
`DURATION` and `SONGITEMID`.

## Surface 1: save-time propagation

After a save succeeds, if the diff touched at least one propagatable cell and
`resolveSiblings` returns any, a bar appears under the toolbar:

> 3 other Aug 16 Ortigas services — apply your 4 changes?  **[Review] [Dismiss]**

A bar, not a modal: most edits are service-specific, so dismissing must be the
zero-friction path. A modal after every save becomes something the user closes
reflexively, which would eventually get a real propagation dismissed by muscle
memory. The bar persists until dismissed or the user navigates away.

**Review** opens a full-height panel, grouped by change rather than by service —
the user's mental unit is "this edit", not "that sheet":

```
Welcome · Notes
  9AM      "Doors open 8:30" → "Doors open 9:00"     ✓
  11:30AM  "Doors open 8:30" → "Doors open 9:00"     ✓
  5PM      currently "Doors open 8:45"           ⚠ [Overwrite]

Worship Set 2 · Duration
  5PM      no matching segment — skipped
```

- Clean rows are ticked by default and can be unticked.
- Diverged rows show the target's current value inline with an amber marker and
  an **Overwrite** button. Clicking it ticks that one cell. There is no bulk
  override — the point of the flag is that each destroyed customisation is seen.
- Unmatched rows are greyed, with no control.
- Footer: **Apply N changes to M services**, disabled at zero.

## Surface 2: compare view

Reached from the runsheet list: tick 2–4 sheets, then **Compare**.

A read-only grid, segments as rows, one column per service, aligned by
`runsheetMatch`. Cells that agree across all shown services render muted; cells
that differ render at full contrast, so divergence is what the eye lands on and
identical sheets look calm. A segment with no counterpart in one service shows a
hatched gap in that column — this is what makes "11:30AM is missing the offering"
visible at a glance.

Person and platform columns are hidden by default, since they always differ and
would be pure noise; a toggle shows them for eyeballing rosters, still read-only.

Hovering a differing cell reveals **⤳ Push to others**. Clicking builds a
single-cell plan and opens the same review panel as Surface 1.

## Execution

One new server action, `rockGetRunsheetDetailsBatch(channelIds)`, loads target
sheets in parallel — needed by both surfaces to match rows and classify divergence.

Writes reuse `rockBulkSaveRunsheetItems` with `changedKeys`. A propagated cell is
exactly a one-key changed row, which is the cheap path the incremental-save design
was built for: one `PATCH /ContentChannelItems/{id}` plus one attribute write. No
new write action.

Per-target-channel calls run under `Promise.allSettled`, reporting per-service
outcomes:

> Applied to 9AM and 11:30AM. 5PM failed — retry?

Retry re-loads the target and re-plans rather than replaying the previous payload,
so a partially applied service cannot be double-written and a cell that has since
diverged is re-flagged rather than silently forced.

Sheets open in another browser tab are not consulted. Propagation writes to Rock;
the other tab's own baseline diff already handles the resulting conflict on its
next save, exactly as it handles any other concurrent edit.

## Files touched

- `src/lib/runsheetSiblings.ts` — new
- `src/lib/runsheetMatch.ts` — new
- `src/lib/runsheetPropagate.ts` — new
- `src/components/runsheet/PropagateReviewPanel.tsx` — new, shared by both surfaces
- `src/components/runsheet/RunsheetCompareView.tsx` — new
- `src/components/runsheet/RunsheetTableEditor.tsx` — post-save propagate bar,
  exposes the session diff
- `src/components/runsheet/RunsheetManager.tsx` — multi-select in the list,
  Compare entry point
- `src/server-actions/rockGetRunsheetDetailsBatch.ts` — new
- `src/types/Runsheet.ts` — `SiblingChannel`, `Match`, `CellChange`,
  `PropagationPlan`
- wherever `columns` is assembled — `HIDDEN_ATTRIBUTE_KEYS`

## Testing

Unit — `runsheetSiblings`:

- Same campus, same date, different times are returned; same time (self) is not.
- Other campuses and other dates are excluded.
- Archived channels are excluded.
- A malformed channel name yields no siblings rather than throwing.

Unit — `runsheetMatch`:

- Rows sharing a `SIBLINGKEY` match regardless of title or order.
- A unique title matches and emits a `backfill` entry for both sides.
- A title appearing twice in the target yields `via: 'none'`.
- A source row with no counterpart yields `targetRow: null`.

Unit — `runsheetPropagate`:

- A target holding the source's previous value is `clean` and `selected`.
- A target holding anything else is `diverged` and not `selected`.
- Person-type and platform columns never appear in a plan.
- `SIBLINGKEY` never appears in a plan.

Integration:

- Applying one propagated cell issues exactly one `changedKeys: ['X']` write per
  selected target and none for unselected targets.
- A target failing mid-run leaves the other targets applied and reports the
  failure by service name.
- Retry after a partial failure re-reads the target and does not re-write the
  services that succeeded.
