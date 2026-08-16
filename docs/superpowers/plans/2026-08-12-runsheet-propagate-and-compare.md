# Runsheet Propagation & Side-by-Side Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user apply a cell-level edit from one runsheet to its same-date, same-campus sibling services (with an explicit review step for anything that's diverged), and let them view 2–4 runsheets side by side with differences highlighted and a one-click push per differing cell.

**Architecture:** A shared pipeline — `resolveSiblings` (find candidate target channels) → `matchRows` (pair up rows by a `SIBLINGKEY` attribute, falling back to unique title) → `buildPropagationPlan` (classify each candidate cell change as clean/diverged/unmatched) → a shared `PropagateReviewPanel` → execution via the existing `rockBulkSaveRunsheetItems` `changedKeys` path. The save-time flow and the compare view both terminate in this same plan/review/execute path; they differ only in what diff they feed the plan builder.

**Tech Stack:** Next.js server actions (`'use server'`), React client components, Rock RMS REST API v17, Jest for unit tests.

## Global Constraints

- Propagation and comparison must never touch person-type columns (`fieldTypeId === 18`, from `ROCK_PERSON_FIELD_TYPE_ID` in `src/constants/runsheetColumns.ts`) or platform columns (`anchorPreacher`, `mainInstrument`, `ledLiveScreens`, `overlayBroadcast`, `lighting`, `audio`).
- v1 target resolution is same-campus, same-date only (no cross-campus, no cross-date, no free picker).
- A diverged target cell must never be overwritten without an explicit per-cell user action; there is no bulk override for diverged cells.
- An unmatched row is shown as skipped, never guessed at.
- All new Rock writes go through the existing `changedKeys` path in `rockBulkSaveRunsheetItems` — no new write action.
- This plan depends on the incremental-save diff mechanism (`baselineRef`, `createRowFingerprint`, `changedKeys`) already present in `src/components/runsheet/RunsheetTableEditor.tsx` and `src/server-actions/rockBulkSaveRunsheetItems.ts` in the working tree. Task 1 commits that work; everything after depends on it existing on `main`.

---

## Task 1: Commit the pending incremental-save work

This plan builds directly on the diff/`changedKeys` mechanism that is already implemented but uncommitted (`git status` shows modifications to `RunsheetTableEditor.tsx`, `rockBulkSaveRunsheetItems.ts`, `Runsheet.ts`, and a new `tests/unit/runsheetDiff.test.ts`). It must land on `main` before any propagation code is written, so that later tasks have a stable base to diff against.

**Files:**
- Modify (verify, do not rewrite): `src/components/runsheet/RunsheetTableEditor.tsx`
- Modify (verify, do not rewrite): `src/server-actions/rockBulkSaveRunsheetItems.ts`
- Modify (verify, do not rewrite): `src/types/Runsheet.ts`
- Test: `tests/unit/runsheetDiff.test.ts`

**Interfaces:**
- Produces (already implemented, confirm these exact shapes exist before continuing):
  - `RunsheetItemRow.changedKeys?: string[]` in `src/types/Runsheet.ts`
  - `ItemResult { clientId: number | string; rockId?: number; ok: boolean; error?: string }` in `src/types/Runsheet.ts`
  - `rockBulkSaveRunsheetItems(channelId, items, deletedIds, columns)` accepts items with an optional `changedKeys` and returns `{ success, error?, results?: ItemResult[] }`

- [ ] **Step 1: Run the existing test suite to confirm the WIP is sound**

```bash
npx jest tests/unit/runsheetDiff.test.ts --verbose
```

Expected: PASS. If it fails, fix the failure before proceeding — do not build propagation on a broken diff.

- [ ] **Step 2: Run the full unit suite to check for regressions from the WIP**

```bash
npx jest tests/unit --verbose
```

Expected: PASS (or only pre-existing, unrelated failures — confirm by checking `git stash` + re-run if any failure looks suspicious, then `git stash pop`).

- [ ] **Step 3: Review the diff for anything that looks unfinished**

```bash
git diff src/components/runsheet/RunsheetTableEditor.tsx src/server-actions/rockBulkSaveRunsheetItems.ts src/types/Runsheet.ts
```

Confirm there are no `TODO`/`FIXME` markers and no dead code paths left from iterating on the design.

- [ ] **Step 4: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx src/server-actions/rockBulkSaveRunsheetItems.ts src/types/Runsheet.ts tests/unit/runsheetDiff.test.ts
git commit -m "feat: send only changed cells on runsheet save"
```

---

## Task 2: Hidden sibling-key attribute and column filtering

Add the `SIBLINGKEY` concept: a constant for the attribute key, a hidden-columns filter so it never renders as a grid column, and a helper that stamps a fresh UUID onto new rows. This task has no Rock schema dependency yet — it only prepares the code so that once the `SIBLINGKEY` attribute is created in Rock (an admin step outside this repo), rows read/write it like any other attribute, and it never leaks into the visible grid.

**Files:**
- Modify: `src/constants/runsheetColumns.ts`
- Modify: `src/server-actions/rockGetRunsheetDetails.ts:190-198` (column filter)
- Create: `src/lib/runsheetSiblingKey.ts`
- Test: `tests/unit/lib/runsheetSiblingKey.test.ts`

**Interfaces:**
- Consumes: `DynamicAttributeColumn { id, key, name, fieldTypeId? }` from `src/types/Runsheet.ts`
- Produces:
  - `SIBLINGKEY_ATTRIBUTE_KEY = 'SIBLINGKEY'` (exported from `src/constants/runsheetColumns.ts`)
  - `HIDDEN_ATTRIBUTE_KEYS: string[]` (exported from `src/constants/runsheetColumns.ts`), containing `'DURATION'`, `'SONGITEMID'`, `'SIBLINGKEY'`
  - `generateSiblingKey(): string` in `src/lib/runsheetSiblingKey.ts` — returns a UUID v4 string via `crypto.randomUUID()`

- [ ] **Step 1: Write the failing test for the sibling-key generator**

```typescript
// tests/unit/lib/runsheetSiblingKey.test.ts
import { generateSiblingKey } from '@/lib/runsheetSiblingKey';

describe('generateSiblingKey', () => {
  it('returns a UUID-shaped string', () => {
    const key = generateSiblingKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns a different value on each call', () => {
    const a = generateSiblingKey();
    const b = generateSiblingKey();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/lib/runsheetSiblingKey.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/lib/runsheetSiblingKey'".

- [ ] **Step 3: Implement the generator**

```typescript
// src/lib/runsheetSiblingKey.ts
/**
 * Shared identifier stamped on corresponding rows across sibling runsheets
 * (same date/campus, different service time), so row correspondence survives
 * title edits and reordering. Stored as the `SIBLINGKEY` item attribute.
 */
export function generateSiblingKey(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/lib/runsheetSiblingKey.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Add the attribute-key constants**

In `src/constants/runsheetColumns.ts`, add near `ROCK_PERSON_FIELD_TYPE_ID`:

```typescript
/** Shared row-lineage key used to match rows across sibling runsheets. Never rendered as a grid column. */
export const SIBLINGKEY_ATTRIBUTE_KEY = 'SIBLINGKEY';

/** Attribute keys that exist in Rock but are never rendered as a dynamic grid column. */
export const HIDDEN_ATTRIBUTE_KEYS = ['DURATION', 'SONGITEMID', SIBLINGKEY_ATTRIBUTE_KEY];
```

- [ ] **Step 6: Use the new constant in the column filter**

In `src/server-actions/rockGetRunsheetDetails.ts`, replace the inline filter:

```typescript
    const columns: DynamicAttributeColumn[] = (rawAttrs || [])
      .filter((attr) => attr.Key !== 'DURATION' && attr.Key !== 'SONGITEMID')
```

with:

```typescript
    const columns: DynamicAttributeColumn[] = (rawAttrs || [])
      .filter((attr) => !HIDDEN_ATTRIBUTE_KEYS.includes(attr.Key))
```

and import `HIDDEN_ATTRIBUTE_KEYS` from `@/constants/runsheetColumns` at the top of the file (alongside the existing `isPersonColumn` import).

- [ ] **Step 7: Run the full unit suite to check nothing broke**

```bash
npx jest tests/unit --verbose
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/constants/runsheetColumns.ts src/server-actions/rockGetRunsheetDetails.ts src/lib/runsheetSiblingKey.ts tests/unit/lib/runsheetSiblingKey.test.ts
git commit -m "feat: add SIBLINGKEY attribute constant and hide it from the grid"
```

---

## Task 3: `runsheetSiblings.ts` — target resolution

Given the currently-open runsheet's name and the list of available channels, find same-campus, same-date, different-time siblings.

**Files:**
- Create: `src/lib/runsheetSiblings.ts`
- Modify: `src/server-actions/rockGetAvailableRunsheetChannels.ts` (export `extractChannelDate` and add a `time` field to `RunsheetChannelOption`)
- Test: `tests/unit/lib/runsheetSiblings.test.ts`

**Interfaces:**
- Consumes:
  - `extractRunsheetCampus(channelName: string): RunsheetCampusCode | null` from `src/lib/runsheetCampus.ts`
  - `extractChannelDate(name: string): Date | null` from `src/server-actions/rockGetAvailableRunsheetChannels.ts` (currently module-private; this task exports it)
  - `RunsheetChannelOption { id: number; name: string }` from `src/server-actions/rockGetAvailableRunsheetChannels.ts`
- Produces:
  ```typescript
  interface SiblingChannel {
    channelId: number;
    name: string;
    time: string;
    preselected: boolean;
  }

  function resolveSiblings(
    sourceChannelId: number,
    sourceName: string,
    allChannels: RunsheetChannelOption[],
  ): SiblingChannel[]
  ```
  Consumed by Task 6 (`PropagateReviewPanel`'s data loading) and Task 9 (compare-view channel picker).

- [ ] **Step 1: Export `extractChannelDate` and add a `time` field**

In `src/server-actions/rockGetAvailableRunsheetChannels.ts`:
1. Add `export` in front of `function extractChannelDate(name: string): Date | null {`.
2. Add a helper right below it:

```typescript
/** Reads the trailing `{time}` segment off a channel name, e.g. `"...// 11:30AM"` → `"11:30AM"`. */
export function extractChannelTime(name: string): string {
  const lastSegment = name.split('//').pop()?.trim() ?? '';
  return lastSegment;
}
```

3. Add `time: extractChannelTime(name)` to the object returned for each `RunsheetChannelOption` in the function that builds the list (find the `.map(...)` that constructs `{ id, name }` and add the field there), and add `time: string;` to the `RunsheetChannelOption` interface.

- [ ] **Step 2: Write the failing tests for `resolveSiblings`**

```typescript
// tests/unit/lib/runsheetSiblings.test.ts
import { resolveSiblings } from '@/lib/runsheetSiblings';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

function channel(id: number, name: string): RunsheetChannelOption {
  return { id, name, time: name.split('//').pop()!.trim() };
}

describe('resolveSiblings', () => {
  const all: RunsheetChannelOption[] = [
    channel(1, 'MNL Crowne // August 16, 2026 // 9AM'),
    channel(2, 'MNL Crowne // August 16, 2026 // 11:30AM'),
    channel(3, 'MNL Crowne // August 16, 2026 // 5PM'),
    channel(4, 'BNE Chapel // August 16, 2026 // 10AM'),
    channel(5, 'MNL Crowne // August 23, 2026 // 9AM'),
  ];

  it('returns same-campus, same-date channels other than the source, all preselected', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.map((s) => s.channelId).sort()).toEqual([2, 3]);
    expect(result.every((s) => s.preselected)).toBe(true);
  });

  it('excludes a different campus on the same date', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.some((s) => s.channelId === 4)).toBe(false);
  });

  it('excludes the same campus on a different date', () => {
    const result = resolveSiblings(1, all[0].name, all);
    expect(result.some((s) => s.channelId === 5)).toBe(false);
  });

  it('returns an empty array for a malformed source name', () => {
    const result = resolveSiblings(1, 'not a runsheet name', all);
    expect(result).toEqual([]);
  });

  it('excludes the source channel itself even if it matches its own campus/date', () => {
    const result = resolveSiblings(2, all[1].name, all);
    expect(result.some((s) => s.channelId === 2)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest tests/unit/lib/runsheetSiblings.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/lib/runsheetSiblings'".

- [ ] **Step 4: Implement `resolveSiblings`**

```typescript
// src/lib/runsheetSiblings.ts
/**
 * Finds same-campus, same-date sibling runsheets for propagation and compare.
 * v1 is intentionally campus-scoped and date-scoped only; `preselected` is
 * always true today but exists so a future "same date, other campuses" option
 * is a change to the filter, not to how the result is consumed.
 */
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { extractChannelDate } from '@/server-actions/rockGetAvailableRunsheetChannels';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

export interface SiblingChannel {
  channelId: number;
  name: string;
  time: string;
  preselected: boolean;
}

export function resolveSiblings(
  sourceChannelId: number,
  sourceName: string,
  allChannels: RunsheetChannelOption[],
): SiblingChannel[] {
  const sourceCampus = extractRunsheetCampus(sourceName);
  const sourceDate = extractChannelDate(sourceName);
  if (!sourceCampus || !sourceDate) return [];

  return allChannels
    .filter((c) => c.id !== sourceChannelId)
    .filter((c) => extractRunsheetCampus(c.name) === sourceCampus)
    .filter((c) => {
      const d = extractChannelDate(c.name);
      return !!d && d.getTime() === sourceDate.getTime();
    })
    .map((c) => ({
      channelId: c.id,
      name: c.name,
      time: c.time,
      preselected: true,
    }));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest tests/unit/lib/runsheetSiblings.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/runsheetSiblings.ts src/server-actions/rockGetAvailableRunsheetChannels.ts tests/unit/lib/runsheetSiblings.test.ts
git commit -m "feat: resolve same-campus same-date sibling runsheets"
```

---

## Task 4: `runsheetMatch.ts` — row correspondence

Pairs rows between a source runsheet and a target runsheet, preferring `SIBLINGKEY` and falling back to a unique title match, and reports which title matches should be backfilled with a shared key.

**Files:**
- Create: `src/lib/runsheetMatch.ts`
- Test: `tests/unit/lib/runsheetMatch.test.ts`

**Interfaces:**
- Consumes: `RunsheetItemRow { id, title, attributeValues, ... }` from `src/types/Runsheet.ts`; `SIBLINGKEY_ATTRIBUTE_KEY` from `src/constants/runsheetColumns.ts`
- Produces:
  ```typescript
  interface RowMatch {
    sourceRow: RunsheetItemRow;
    targetRow: RunsheetItemRow | null;
    via: 'siblingKey' | 'title' | 'none';
  }

  interface SiblingKeyBackfill {
    channelId: number;
    itemId: number;
    key: string;
  }

  interface MatchResult {
    matches: RowMatch[];
    backfill: SiblingKeyBackfill[];
  }

  function matchRows(
    sourceRows: RunsheetItemRow[],
    targetChannelId: number,
    targetRows: RunsheetItemRow[],
  ): MatchResult
  ```
  Consumed by Task 5 (`buildPropagationPlan`).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/lib/runsheetMatch.test.ts
import { matchRows } from '@/lib/runsheetMatch';
import type { RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, siblingKey?: string): RunsheetItemRow {
  return {
    id,
    title,
    order: id,
    duration: 5,
    attributeValues: siblingKey ? { SIBLINGKEY: siblingKey } : {},
  };
}

describe('matchRows', () => {
  it('matches rows sharing a SIBLINGKEY regardless of title', () => {
    const source = [row(1, 'Welcome', 'abc-123')];
    const target = [row(10, 'Welcome Note', 'abc-123')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('siblingKey');
    expect(matches[0].targetRow?.id).toBe(10);
    expect(backfill).toEqual([]);
  });

  it('matches by unique title when neither row has a SIBLINGKEY, and emits a backfill entry for both sides', () => {
    const source = [row(1, 'Welcome')];
    const target = [row(10, 'Welcome')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
    expect(backfill).toHaveLength(2);
    expect(backfill.map((b) => b.itemId).sort()).toEqual([1, 10]);
    expect(backfill[0].key).toBe(backfill[1].key);
  });

  it('does not match a title that appears twice in the target', () => {
    const source = [row(1, 'Song')];
    const target = [row(10, 'Song'), row(11, 'Song')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('none');
    expect(matches[0].targetRow).toBeNull();
    expect(backfill).toEqual([]);
  });

  it('reports none for a source row with no counterpart', () => {
    const source = [row(1, 'Altar Call')];
    const target = [row(10, 'Welcome')];
    const { matches } = matchRows(source, 99, target);

    expect(matches[0].via).toBe('none');
    expect(matches[0].targetRow).toBeNull();
  });

  it('prefers SIBLINGKEY over a conflicting title match', () => {
    const source = [row(1, 'Welcome', 'abc-123')];
    const target = [row(10, 'Something Else', 'abc-123'), row(11, 'Welcome')];
    const { matches } = matchRows(source, 99, target);

    expect(matches[0].via).toBe('siblingKey');
    expect(matches[0].targetRow?.id).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/lib/runsheetMatch.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/lib/runsheetMatch'".

- [ ] **Step 3: Implement `matchRows`**

```typescript
// src/lib/runsheetMatch.ts
/**
 * Pairs rows between a source runsheet and a sibling target so a cell edit
 * can be located in the other sheet. SIBLINGKEY is tried first because it
 * survives renames and reordering; a unique title is the fallback for rows
 * that predate the key, and every title match backfills the key onto both
 * sides so future matches for that pair are SIBLINGKEY matches.
 */
import { SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import { generateSiblingKey } from '@/lib/runsheetSiblingKey';
import type { RunsheetItemRow } from '@/types/Runsheet';

export interface RowMatch {
  sourceRow: RunsheetItemRow;
  targetRow: RunsheetItemRow | null;
  via: 'siblingKey' | 'title' | 'none';
}

export interface SiblingKeyBackfill {
  channelId: number;
  itemId: number;
  key: string;
}

export interface MatchResult {
  matches: RowMatch[];
  backfill: SiblingKeyBackfill[];
}

function keyOf(row: RunsheetItemRow): string | undefined {
  return row.attributeValues?.[SIBLINGKEY_ATTRIBUTE_KEY] || undefined;
}

function titleOf(row: RunsheetItemRow): string {
  return (row.attributeValues?.ACTIVITYTITLE || row.title || '').trim();
}

export function matchRows(
  sourceRows: RunsheetItemRow[],
  targetChannelId: number,
  targetRows: RunsheetItemRow[],
): MatchResult {
  const targetByKey = new Map<string, RunsheetItemRow>();
  for (const t of targetRows) {
    const k = keyOf(t);
    if (k) targetByKey.set(k, t);
  }

  const titleCounts = new Map<string, number>();
  for (const t of targetRows) {
    const title = titleOf(t);
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const targetByUniqueTitle = new Map<string, RunsheetItemRow>();
  for (const t of targetRows) {
    const title = titleOf(t);
    if (titleCounts.get(title) === 1) targetByUniqueTitle.set(title, t);
  }

  const matches: RowMatch[] = [];
  const backfill: SiblingKeyBackfill[] = [];

  for (const source of sourceRows) {
    const sourceKey = keyOf(source);
    const keyMatch = sourceKey ? targetByKey.get(sourceKey) : undefined;
    if (keyMatch) {
      matches.push({ sourceRow: source, targetRow: keyMatch, via: 'siblingKey' });
      continue;
    }

    const sourceTitle = titleOf(source);
    const isSourceTitleUnique =
      sourceRows.filter((r) => titleOf(r) === sourceTitle).length === 1;
    const titleMatch = isSourceTitleUnique ? targetByUniqueTitle.get(sourceTitle) : undefined;

    if (titleMatch) {
      matches.push({ sourceRow: source, targetRow: titleMatch, via: 'title' });
      if (typeof source.id === 'number' && typeof titleMatch.id === 'number') {
        const newKey = generateSiblingKey();
        backfill.push({ channelId: -1, itemId: source.id, key: newKey });
        backfill.push({ channelId: targetChannelId, itemId: titleMatch.id, key: newKey });
      }
      continue;
    }

    matches.push({ sourceRow: source, targetRow: null, via: 'none' });
  }

  return { matches, backfill };
}
```

Note: `backfill` entries for the source side use `channelId: -1` as a placeholder because `matchRows` isn't given the source channel id — the caller (Task 5/6) knows it and must replace `-1` with the real source channel id before writing. This is documented at the call site in Task 6.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/lib/runsheetMatch.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetMatch.ts tests/unit/lib/runsheetMatch.test.ts
git commit -m "feat: match runsheet rows across siblings by SIBLINGKEY or title"
```

---

## Task 5: `runsheetPropagate.ts` — plan builder

Given a set of candidate cell changes (from a save-time diff or a compare-view single-cell push), the matches from Task 4, and the target rows, builds a `PropagationPlan` classifying every cell as clean/diverged/unmatched, with propagation-excluded columns filtered out entirely.

**Files:**
- Create: `src/lib/runsheetPropagate.ts`
- Test: `tests/unit/lib/runsheetPropagate.test.ts`

**Interfaces:**
- Consumes:
  - `RowMatch`, `MatchResult` from `src/lib/runsheetMatch.ts`
  - `SiblingChannel` from `src/lib/runsheetSiblings.ts`
  - `DynamicAttributeColumn` from `src/types/Runsheet.ts`
  - `isPersonColumn` from `src/constants/runsheetColumns.ts`
  - `SIBLINGKEY_ATTRIBUTE_KEY` from `src/constants/runsheetColumns.ts`
- Produces:
  ```typescript
  interface CandidateCellChange {
    itemTitle: string;
    columnKey: string;
    columnName: string;
    newValue: string;
    previousValue: string; // value before the source edit, used to detect divergence
  }

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

  interface PropagationTarget {
    channel: SiblingChannel;
    changes: CellChange[];
  }

  interface PropagationPlan {
    targets: PropagationTarget[];
  }

  const PROPAGATION_EXCLUDED_KEYS: string[]; // platform + person column keys, plus SIBLINGKEY

  function buildPropagationPlan(
    candidateChanges: CandidateCellChange[],
    matchResultsByChannel: Map<number, MatchResult>,
    targets: SiblingChannel[],
    columns: DynamicAttributeColumn[],
  ): PropagationPlan
  ```
  Consumed by Task 6 (`PropagateReviewPanel`) and Task 8/9 (callers that build `candidateChanges` from a save diff or a compare-view push).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/lib/runsheetPropagate.test.ts
import { buildPropagationPlan } from '@/lib/runsheetPropagate';
import type { RowMatch, MatchResult } from '@/lib/runsheetMatch';
import type { SiblingChannel } from '@/lib/runsheetSiblings';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, attrs: Record<string, string> = {}): RunsheetItemRow {
  return { id, title, order: id, duration: 5, attributeValues: attrs };
}

const target: SiblingChannel = { channelId: 2, name: 'MNL Crowne // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true };

const columns: DynamicAttributeColumn[] = [
  { id: 1, key: 'NOTES', name: 'Notes' },
  { id: 2, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
];

describe('buildPropagationPlan', () => {
  it('marks a target cell clean when it still holds the source pre-edit value', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { NOTES: 'Doors open 8:30' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
      matchResults,
      [target],
      columns,
    );

    expect(plan.targets[0].changes[0].status).toBe('clean');
    expect(plan.targets[0].changes[0].selected).toBe(true);
  });

  it('marks a target cell diverged when it holds something else, unselected', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { NOTES: 'Doors open 8:45' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'Doors open 9:00', previousValue: 'Doors open 8:30' }],
      matchResults,
      [target],
      columns,
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('diverged');
    expect(change.targetCurrentValue).toBe('Doors open 8:45');
    expect(change.selected).toBe(false);
  });

  it('marks a change unmatched when there is no target row, and does not read targetCurrentValue', () => {
    const unmatched: RowMatch = { sourceRow: row(1, 'Altar Call'), targetRow: null, via: 'none' };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [unmatched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Altar Call', columnKey: 'NOTES', columnName: 'Notes', newValue: 'New copy', previousValue: 'Old copy' }],
      matchResults,
      [target],
      columns,
    );

    const change = plan.targets[0].changes[0];
    expect(change.status).toBe('unmatched');
    expect(change.targetCurrentValue).toBeNull();
    expect(change.selected).toBe(false);
  });

  it('excludes person-type columns from the plan entirely', () => {
    const matched: RowMatch = {
      sourceRow: row(1, 'Welcome'),
      targetRow: row(10, 'Welcome', { PLATFORM: 'Jane Doe' }),
      via: 'title',
    };
    const matchResults = new Map<number, MatchResult>([[2, { matches: [matched], backfill: [] }]]);

    const plan = buildPropagationPlan(
      [{ itemTitle: 'Welcome', columnKey: 'PLATFORM', columnName: 'Anchor / Preacher', newValue: 'John Smith', previousValue: 'Jane Doe' }],
      matchResults,
      [target],
      columns,
    );

    expect(plan.targets[0].changes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/lib/runsheetPropagate.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/lib/runsheetPropagate'".

- [ ] **Step 3: Implement `buildPropagationPlan`**

```typescript
// src/lib/runsheetPropagate.ts
/**
 * Builds a review-ready propagation plan from a set of candidate cell
 * changes and the row matches for each target sibling. Person and platform
 * columns are filtered before the plan exists, not at render time, so an
 * excluded column can never reach either surface that consumes this plan.
 */
import { isPersonColumn, SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import type { MatchResult } from '@/lib/runsheetMatch';
import type { SiblingChannel } from '@/lib/runsheetSiblings';
import type { DynamicAttributeColumn } from '@/types/Runsheet';

export interface CandidateCellChange {
  itemTitle: string;
  columnKey: string;
  columnName: string;
  newValue: string;
  previousValue: string;
}

export type CellStatus = 'clean' | 'diverged' | 'unmatched';

export interface CellChange {
  itemTitle: string;
  columnKey: string;
  columnName: string;
  newValue: string;
  sourcePreviousValue: string;
  targetCurrentValue: string | null;
  status: CellStatus;
  selected: boolean;
}

export interface PropagationTarget {
  channel: SiblingChannel;
  changes: CellChange[];
}

export interface PropagationPlan {
  targets: PropagationTarget[];
}

const PLATFORM_COLUMN_KEYS = [
  'ANCHORPREACHER',
  'MAININSTRUMENT',
  'LEDLIVESCREENS',
  'LED WALL',
  'OVERLAYBROADCAST',
  'LIGHTING',
  'AUDIO',
];

function isExcludedColumn(columnKey: string, columns: DynamicAttributeColumn[]): boolean {
  if (columnKey === SIBLINGKEY_ATTRIBUTE_KEY) return true;
  if (PLATFORM_COLUMN_KEYS.includes(columnKey.toUpperCase())) return true;

  const column = columns.find((c) => c.key === columnKey);
  return !!column && isPersonColumn(column);
}

export function buildPropagationPlan(
  candidateChanges: CandidateCellChange[],
  matchResultsByChannel: Map<number, MatchResult>,
  targets: SiblingChannel[],
  columns: DynamicAttributeColumn[],
): PropagationPlan {
  const eligibleChanges = candidateChanges.filter((c) => !isExcludedColumn(c.columnKey, columns));

  const planTargets: PropagationTarget[] = targets.map((channel) => {
    const matchResult = matchResultsByChannel.get(channel.channelId);
    const changes: CellChange[] = [];

    for (const candidate of eligibleChanges) {
      const rowMatch = matchResult?.matches.find(
        (m) => (m.sourceRow.attributeValues?.ACTIVITYTITLE || m.sourceRow.title) === candidate.itemTitle,
      );

      if (!rowMatch || !rowMatch.targetRow) {
        changes.push({
          itemTitle: candidate.itemTitle,
          columnKey: candidate.columnKey,
          columnName: candidate.columnName,
          newValue: candidate.newValue,
          sourcePreviousValue: candidate.previousValue,
          targetCurrentValue: null,
          status: 'unmatched',
          selected: false,
        });
        continue;
      }

      const targetCurrentValue = rowMatch.targetRow.attributeValues?.[candidate.columnKey] ?? '';
      const isClean = targetCurrentValue === candidate.previousValue;

      changes.push({
        itemTitle: candidate.itemTitle,
        columnKey: candidate.columnKey,
        columnName: candidate.columnName,
        newValue: candidate.newValue,
        sourcePreviousValue: candidate.previousValue,
        targetCurrentValue,
        status: isClean ? 'clean' : 'diverged',
        selected: isClean,
      });
    }

    return { channel, changes };
  });

  return { targets: planTargets };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/lib/runsheetPropagate.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetPropagate.ts tests/unit/lib/runsheetPropagate.test.ts
git commit -m "feat: build propagation plans with clean/diverged/unmatched cell status"
```

---

## Task 6: `rockGetRunsheetDetailsBatch` server action

Loads multiple runsheet channels in parallel, reusing the existing single-channel loader. Needed by both surfaces to fetch target/comparison data.

**Files:**
- Create: `src/server-actions/rockGetRunsheetDetailsBatch.ts`
- Test: `tests/unit/server-actions/rockGetRunsheetDetailsBatch.test.ts`

**Interfaces:**
- Consumes: `rockGetRunsheetDetails(channelId: number)` from `src/server-actions/rockGetRunsheetDetails.ts`
- Produces:
  ```typescript
  interface BatchRunsheetResult {
    channelId: number;
    success: boolean;
    data?: RunsheetDetails;
    error?: string;
  }

  async function rockGetRunsheetDetailsBatch(channelIds: number[]): Promise<BatchRunsheetResult[]>
  ```
  Consumed by Task 8 (save-time propagate panel data load) and Task 9 (compare view).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/server-actions/rockGetRunsheetDetailsBatch.test.ts
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('@/server-actions/rockGetRunsheetDetails');

describe('rockGetRunsheetDetailsBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads every channel in parallel and tags each result with its channelId', async () => {
    (rockGetRunsheetDetails as jest.Mock).mockImplementation(async (id: number) => ({
      success: true,
      data: { channelId: id, name: `Channel ${id}`, contentChannelTypeId: 13, columns: [], items: [] },
    }));

    const results = await rockGetRunsheetDetailsBatch([1, 2, 3]);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.channelId).sort()).toEqual([1, 2, 3]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('reports a per-channel failure without failing the whole batch', async () => {
    (rockGetRunsheetDetails as jest.Mock).mockImplementation(async (id: number) => {
      if (id === 2) return { success: false, error: 'not found' };
      return { success: true, data: { channelId: id, name: `Channel ${id}`, contentChannelTypeId: 13, columns: [], items: [] } };
    });

    const results = await rockGetRunsheetDetailsBatch([1, 2]);

    const failed = results.find((r) => r.channelId === 2);
    expect(failed?.success).toBe(false);
    expect(failed?.error).toBe('not found');
    const ok = results.find((r) => r.channelId === 1);
    expect(ok?.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/server-actions/rockGetRunsheetDetailsBatch.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/server-actions/rockGetRunsheetDetailsBatch'".

- [ ] **Step 3: Implement the batch loader**

```typescript
// src/server-actions/rockGetRunsheetDetailsBatch.ts
'use server';

import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { RunsheetDetails } from '@/types/Runsheet';

export interface BatchRunsheetResult {
  channelId: number;
  success: boolean;
  data?: RunsheetDetails;
  error?: string;
}

/** Loads several runsheet channels in parallel for propagation targets and compare view. */
export async function rockGetRunsheetDetailsBatch(channelIds: number[]): Promise<BatchRunsheetResult[]> {
  return Promise.all(
    channelIds.map(async (channelId) => {
      const res = await rockGetRunsheetDetails(channelId);
      return { channelId, success: res.success, data: res.data, error: res.error };
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/server-actions/rockGetRunsheetDetailsBatch.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/rockGetRunsheetDetailsBatch.ts tests/unit/server-actions/rockGetRunsheetDetailsBatch.test.ts
git commit -m "feat: add batch loader for sibling runsheet details"
```

---

## Task 7: Propagation executor

Turns a `PropagationPlan` plus the user's per-cell selections into writes: one `rockBulkSaveRunsheetItems` call per target channel with `changedKeys`-scoped rows, run with `Promise.allSettled`, plus the `SIBLINGKEY` backfill writes. This is the shared logic both UI surfaces call.

**Files:**
- Create: `src/lib/runsheetPropagateExecute.ts`
- Test: `tests/unit/lib/runsheetPropagateExecute.test.ts`

**Interfaces:**
- Consumes:
  - `PropagationPlan`, `CellChange` from `src/lib/runsheetPropagate.ts`
  - `SiblingKeyBackfill` from `src/lib/runsheetMatch.ts`
  - `rockBulkSaveRunsheetItems(channelId, items, deletedIds, columns)` from `src/server-actions/rockBulkSaveRunsheetItems.ts`
  - `RunsheetItemRow`, `DynamicAttributeColumn` from `src/types/Runsheet.ts`
- Produces:
  ```typescript
  interface PropagationOutcome {
    channelId: number;
    channelName: string;
    ok: boolean;
    error?: string;
    appliedCount: number;
  }

  async function executePropagationPlan(
    plan: PropagationPlan,
    targetRowsByChannel: Map<number, RunsheetItemRow[]>,
    columns: DynamicAttributeColumn[],
  ): Promise<PropagationOutcome[]>
  ```
  Consumed by Task 8 (`PropagateReviewPanel`'s Apply button) and Task 9 (compare view's per-cell push, called with a single-target, single-change plan).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/lib/runsheetPropagateExecute.test.ts
import { executePropagationPlan } from '@/lib/runsheetPropagateExecute';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('@/server-actions/rockBulkSaveRunsheetItems');

function targetRow(id: number, title: string): RunsheetItemRow {
  return { id, title, order: 1, duration: 5, attributeValues: { NOTES: 'old' } };
}

describe('executePropagationPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends exactly one changedKeys write per selected cell, per target', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [{ clientId: 10, ok: true }] });

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 11:30AM', time: '11:30AM', preselected: true },
          changes: [
            {
              itemTitle: 'Welcome',
              columnKey: 'NOTES',
              columnName: 'Notes',
              newValue: 'new',
              sourcePreviousValue: 'old',
              targetCurrentValue: 'old',
              status: 'clean',
              selected: true,
            },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]]]);
    await executePropagationPlan(plan, targetRows, []);

    expect(rockBulkSaveRunsheetItems).toHaveBeenCalledTimes(1);
    const [, items] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(10);
    expect(items[0].changedKeys).toEqual(['NOTES']);
    expect(items[0].attributeValues.NOTES).toBe('new');
  });

  it('skips a target entirely when it has no selected changes', async () => {
    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X', time: '11:30AM', preselected: true },
          changes: [
            {
              itemTitle: 'Welcome',
              columnKey: 'NOTES',
              columnName: 'Notes',
              newValue: 'new',
              sourcePreviousValue: 'old',
              targetCurrentValue: 'different',
              status: 'diverged',
              selected: false,
            },
          ],
        },
      ],
    };

    await executePropagationPlan(plan, new Map([[2, [targetRow(10, 'Welcome')]]]), []);
    expect(rockBulkSaveRunsheetItems).not.toHaveBeenCalled();
  });

  it('reports a per-target failure without throwing and without affecting other targets', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock)
      .mockResolvedValueOnce({ success: true, results: [{ clientId: 10, ok: true }] })
      .mockRejectedValueOnce(new Error('Rock timeout'));

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true },
          ],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, []);

    expect(outcomes.find((o) => o.channelId === 2)?.ok).toBe(true);
    expect(outcomes.find((o) => o.channelId === 3)?.ok).toBe(false);
    expect(outcomes.find((o) => o.channelId === 3)?.error).toContain('Rock timeout');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/lib/runsheetPropagateExecute.test.ts --verbose
```

Expected: FAIL with "Cannot find module '@/lib/runsheetPropagateExecute'".

- [ ] **Step 3: Implement `executePropagationPlan`**

```typescript
// src/lib/runsheetPropagateExecute.ts
/**
 * Turns a reviewed PropagationPlan into writes. A propagated cell is exactly
 * a one-key changedKeys row, so this reuses rockBulkSaveRunsheetItems's cheap
 * path rather than a new write action. Runs per target under
 * Promise.allSettled so one Rock timeout can't take down the others; retry
 * is just calling this again with a freshly-built plan.
 */
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

export interface PropagationOutcome {
  channelId: number;
  channelName: string;
  ok: boolean;
  error?: string;
  appliedCount: number;
}

export async function executePropagationPlan(
  plan: PropagationPlan,
  targetRowsByChannel: Map<number, RunsheetItemRow[]>,
  columns: DynamicAttributeColumn[],
): Promise<PropagationOutcome[]> {
  const results = await Promise.allSettled(
    plan.targets.map(async ({ channel, changes }) => {
      const selected = changes.filter((c) => c.selected);
      if (selected.length === 0) {
        return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: 0 };
      }

      const targetRows = targetRowsByChannel.get(channel.channelId) || [];
      const changesByItemTitle = new Map<string, typeof selected>();
      for (const change of selected) {
        changesByItemTitle.set(change.itemTitle, [...(changesByItemTitle.get(change.itemTitle) || []), change]);
      }

      const itemsToSave: RunsheetItemRow[] = [];
      for (const [itemTitle, itemChanges] of changesByItemTitle) {
        const targetRow = targetRows.find(
          (r) => (r.attributeValues?.ACTIVITYTITLE || r.title) === itemTitle,
        );
        if (!targetRow || typeof targetRow.id !== 'number') continue;

        const attributeValues = { ...targetRow.attributeValues };
        const changedKeys: string[] = [];
        for (const change of itemChanges) {
          attributeValues[change.columnKey] = change.newValue;
          changedKeys.push(change.columnKey);
        }

        itemsToSave.push({ ...targetRow, attributeValues, changedKeys });
      }

      if (itemsToSave.length === 0) {
        return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: 0 };
      }

      const res = await rockBulkSaveRunsheetItems(channel.channelId, itemsToSave, [], columns);
      if (!res.success) throw new Error(res.error || 'Save failed');

      return { channelId: channel.channelId, channelName: channel.name, ok: true, appliedCount: itemsToSave.length };
    }),
  );

  return results.map((result, i) => {
    const channel = plan.targets[i].channel;
    if (result.status === 'fulfilled') return result.value;
    return {
      channelId: channel.channelId,
      channelName: channel.name,
      ok: false,
      error: result.reason?.message || 'Unknown error',
      appliedCount: 0,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/lib/runsheetPropagateExecute.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetPropagateExecute.ts tests/unit/lib/runsheetPropagateExecute.test.ts
git commit -m "feat: execute propagation plans with per-target failure isolation"
```

---

## Task 8: `PropagateReviewPanel` component

The shared review UI: grouped by change, clean rows ticked, diverged rows flagged with an Overwrite action, unmatched rows greyed out, footer with an Apply button. Used by both the save-time bar (Task 9) and the compare view (Task 10).

**Files:**
- Create: `src/components/runsheet/PropagateReviewPanel.tsx`
- Test: `tests/unit/components/PropagateReviewPanel.test.tsx`

**Interfaces:**
- Consumes: `PropagationPlan`, `CellChange`, `PropagationTarget` from `src/lib/runsheetPropagate.ts`; `PropagationOutcome` from `src/lib/runsheetPropagateExecute.ts`
- Produces: React component
  ```typescript
  interface PropagateReviewPanelProps {
    plan: PropagationPlan;
    onOverwrite: (targetChannelId: number, itemTitle: string, columnKey: string) => void;
    onApply: () => void;
    applying: boolean;
    outcomes?: PropagationOutcome[];
  }

  function PropagateReviewPanel(props: PropagateReviewPanelProps): JSX.Element
  ```
  Consumed by Task 9 (`RunsheetTableEditor`) and Task 10 (`RunsheetCompareView`), both of which own the `plan` state and pass down `onOverwrite`/`onApply` handlers that call `buildPropagationPlan`/`executePropagationPlan`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/PropagateReviewPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PropagateReviewPanel } from '@/components/runsheet/PropagateReviewPanel';
import type { PropagationPlan } from '@/lib/runsheetPropagate';

const plan: PropagationPlan = {
  targets: [
    {
      channel: { channelId: 2, name: 'MNL Crowne // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
      changes: [
        {
          itemTitle: 'Welcome',
          columnKey: 'NOTES',
          columnName: 'Notes',
          newValue: 'Doors open 9:00',
          sourcePreviousValue: 'Doors open 8:30',
          targetCurrentValue: 'Doors open 8:45',
          status: 'diverged',
          selected: false,
        },
        {
          itemTitle: 'Worship Set 2',
          columnKey: 'DURATION_TEXT',
          columnName: 'Duration',
          newValue: '10',
          sourcePreviousValue: '8',
          targetCurrentValue: null,
          status: 'unmatched',
          selected: false,
        },
      ],
    },
  ],
};

describe('PropagateReviewPanel', () => {
  it('shows a diverged cell with its current value and an Overwrite action', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByText(/Doors open 8:45/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /overwrite/i })).toBeInTheDocument();
  });

  it('shows an unmatched row as skipped with no action', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByText(/no matching segment|skipped/i)).toBeInTheDocument();
  });

  it('calls onOverwrite with the target channel, item title, and column key when clicked', () => {
    const onOverwrite = jest.fn();
    render(<PropagateReviewPanel plan={plan} onOverwrite={onOverwrite} onApply={jest.fn()} applying={false} />);
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
    expect(onOverwrite).toHaveBeenCalledWith(2, 'Welcome', 'NOTES');
  });

  it('disables Apply when no cells are selected', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('enables Apply once at least one cell is selected', () => {
    const selectedPlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [{ ...plan.targets[0].changes[0], status: 'clean', selected: true }] }],
    };
    render(<PropagateReviewPanel plan={selectedPlan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/components/PropagateReviewPanel.test.tsx --verbose
```

Expected: FAIL with "Cannot find module '@/components/runsheet/PropagateReviewPanel'".

- [ ] **Step 3: Implement the panel**

```tsx
// src/components/runsheet/PropagateReviewPanel.tsx
'use client';

import React from 'react';
import type { CellChange, PropagationPlan } from '@/lib/runsheetPropagate';
import type { PropagationOutcome } from '@/lib/runsheetPropagateExecute';

interface PropagateReviewPanelProps {
  plan: PropagationPlan;
  onOverwrite: (targetChannelId: number, itemTitle: string, columnKey: string) => void;
  onApply: () => void;
  applying: boolean;
  outcomes?: PropagationOutcome[];
}

interface GroupedChange {
  itemTitle: string;
  columnName: string;
  rows: { channelId: number; time: string; change: CellChange }[];
}

function groupByChange(plan: PropagationPlan): GroupedChange[] {
  const groups = new Map<string, GroupedChange>();

  for (const target of plan.targets) {
    for (const change of target.changes) {
      const key = `${change.itemTitle}::${change.columnKey}`;
      if (!groups.has(key)) {
        groups.set(key, { itemTitle: change.itemTitle, columnName: change.columnName, rows: [] });
      }
      groups.get(key)!.rows.push({ channelId: target.channel.channelId, time: target.channel.time, change });
    }
  }

  return Array.from(groups.values());
}

export function PropagateReviewPanel({ plan, onOverwrite, onApply, applying, outcomes }: PropagateReviewPanelProps) {
  const groups = groupByChange(plan);
  const selectedCount = plan.targets.reduce((sum, t) => sum + t.changes.filter((c) => c.selected).length, 0);
  const targetCount = new Set(
    plan.targets.filter((t) => t.changes.some((c) => c.selected)).map((t) => t.channel.channelId),
  ).size;

  const outcomeFor = (channelId: number) => outcomes?.find((o) => o.channelId === channelId);

  return (
    <div className="propagate-review-panel" role="region" aria-label="Propagate changes">
      {groups.map((group) => (
        <div key={`${group.itemTitle}::${group.columnName}`} className="propagate-review-group">
          <div className="propagate-review-group-title">
            {group.itemTitle} · {group.columnName}
          </div>
          {group.rows.map(({ channelId, time, change }) => {
            const outcome = outcomeFor(channelId);
            return (
              <div key={`${channelId}-${change.columnKey}`} className="propagate-review-row">
                <span className="propagate-review-time">{time}</span>
                {change.status === 'unmatched' && (
                  <span className="propagate-review-skipped">no matching segment — skipped</span>
                )}
                {change.status === 'clean' && (
                  <span className="propagate-review-clean">{change.newValue}</span>
                )}
                {change.status === 'diverged' && (
                  <>
                    <span className="propagate-review-diverged">currently &quot;{change.targetCurrentValue}&quot;</span>
                    {!change.selected && (
                      <button
                        type="button"
                        onClick={() => onOverwrite(channelId, change.itemTitle, change.columnKey)}
                      >
                        Overwrite
                      </button>
                    )}
                  </>
                )}
                {outcome && !outcome.ok && <span className="propagate-review-error">failed: {outcome.error}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <div className="propagate-review-footer">
        <button type="button" onClick={onApply} disabled={selectedCount === 0 || applying}>
          {applying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'} to ${targetCount} service${targetCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/components/PropagateReviewPanel.test.tsx --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/PropagateReviewPanel.tsx tests/unit/components/PropagateReviewPanel.test.tsx
git commit -m "feat: add shared propagation review panel"
```

---

## Task 9: Save-time propagate bar in `RunsheetTableEditor`

Wires the pipeline into the editor: after a successful save, if the diff touched a propagatable cell and siblings exist, show the bar; Review opens `PropagateReviewPanel` fed from the session's own diff.

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx`
- Test: `tests/unit/components/RunsheetTableEditor.propagate.test.tsx`

**Interfaces:**
- Consumes:
  - `resolveSiblings` from `src/lib/runsheetSiblings.ts`
  - `matchRows` from `src/lib/runsheetMatch.ts`
  - `buildPropagationPlan`, `CandidateCellChange` from `src/lib/runsheetPropagate.ts`
  - `executePropagationPlan` from `src/lib/runsheetPropagateExecute.ts`
  - `rockGetRunsheetDetailsBatch` from `src/server-actions/rockGetRunsheetDetailsBatch.ts`
  - `rockGetAvailableRunsheetChannels` from `src/server-actions/rockGetAvailableRunsheetChannels.ts`
  - `PropagateReviewPanel` from `src/components/runsheet/PropagateReviewPanel.tsx`
  - Existing in-file `changedKeys` computation from the incremental-save work (Task 1) — this task reads the same per-save changed-cell list rather than recomputing it, so the candidate changes passed to `buildPropagationPlan` come from the same diff pass already producing `itemsToSave` in the save handler.
- Produces: no new exports; internal component state `propagateBarVisible`, `propagatePlan`, `propagateOutcomes`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/RunsheetTableEditor.propagate.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';

jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');

// NOTE: adapt these props to RunsheetTableEditor's actual prop names/shape —
// read the top of RunsheetTableEditor.tsx before writing this test, since the
// component takes `initialItems`, `channelId`, `columns`, etc. per the existing
// incremental-save tests in tests/unit/runsheetDiff.test.ts (if any component-level
// test already exists there) or per its own prop interface.
describe('RunsheetTableEditor propagate bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
        { id: 2, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
      ],
    });
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // August 16, 2026 // 11:30AM',
          contentChannelTypeId: 13,
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [{ id: 20, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Doors open 8:30' } }],
        },
      },
    ]);
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [{ clientId: 1, rockId: 1, ok: true }] });
  });

  it('shows the propagate bar after a save that changes a propagatable cell, with sibling count and date', async () => {
    render(
      <RunsheetTableEditor
        channelId={1}
        initialName="MNL Crowne // August 16, 2026 // 9AM"
        initialSubtitle=""
        contentChannelTypeId={13}
        columns={[{ id: 1, key: 'NOTES', name: 'Notes' }]}
        initialItems={[{ id: 1, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Doors open 8:30' } }]}
        readOnly={false}
      />,
    );

    // Edit the NOTES cell for row 1, then trigger save — exact interaction
    // depends on the grid's existing cell-edit test helpers; reuse whatever
    // tests/unit/runsheetDiff.test.ts or existing component tests use to
    // simulate a cell edit and clicking Save.

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/apply.*change/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/components/RunsheetTableEditor.propagate.test.tsx --verbose
```

Expected: FAIL — the propagate bar doesn't exist yet, so the `waitFor` assertion times out (or the test itself needs adjustment once you've read the real prop interface and cell-edit helpers in the file, per the NOTE above).

- [ ] **Step 3: Add propagate state and the post-save trigger**

Near the other `useState` declarations in `RunsheetTableEditor.tsx` (close to `isDirty`, `baselineRef`), add:

```typescript
import { resolveSiblings, type SiblingChannel } from '@/lib/runsheetSiblings';
import { matchRows, type MatchResult } from '@/lib/runsheetMatch';
import { buildPropagationPlan, type PropagationPlan, type CandidateCellChange } from '@/lib/runsheetPropagate';
import { executePropagationPlan, type PropagationOutcome } from '@/lib/runsheetPropagateExecute';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { PropagateReviewPanel } from '@/components/runsheet/PropagateReviewPanel';
import { isPersonColumn } from '@/constants/runsheetColumns';

// ...inside the component:
const [propagateSiblings, setPropagateSiblings] = useState<SiblingChannel[]>([]);
const [propagateCandidates, setPropagateCandidates] = useState<CandidateCellChange[]>([]);
const [propagateBarDismissed, setPropagateBarDismissed] = useState(false);
const [propagatePlan, setPropagatePlan] = useState<PropagationPlan | null>(null);
const [propagateReviewOpen, setPropagateReviewOpen] = useState(false);
const [propagateApplying, setPropagateApplying] = useState(false);
const [propagateOutcomes, setPropagateOutcomes] = useState<PropagationOutcome[] | undefined>(undefined);
const [propagateTargetRows, setPropagateTargetRows] = useState<Map<number, RunsheetItemRow[]>>(new Map());
```

Locate the existing save handler's success path — where `itemsToSave` (rows with `changedKeys`) has just been built and the save call has resolved successfully. Immediately after, translate the changed rows into candidates and check for siblings:

```typescript
// After a successful save, inside the same handler that built `itemsToSave`:
const candidates: CandidateCellChange[] = [];
for (const item of itemsToSave) {
  if (typeof item.id === 'string' || item.isNew) continue; // new rows have no baseline to diff against for propagation
  const baseline = baselineRef.current.get(item.id);
  if (!baseline) continue;
  for (const key of item.changedKeys || []) {
    if (key === 'title' || key === 'order' || key === 'startDateTime' || key === 'duration' || key === 'songItemId') continue;
    const column = columns.find((c) => c.key === key);
    if (column && isPersonColumn(column)) continue;
    candidates.push({
      itemTitle: item.attributeValues?.ACTIVITYTITLE || item.title,
      columnKey: key,
      columnName: column?.name || key,
      newValue: item.attributeValues?.[key] ?? '',
      previousValue: baseline.attributeValues?.[key] ?? '',
    });
  }
}

if (candidates.length > 0) {
  const channelsRes = await rockGetAvailableRunsheetChannels(false);
  if (channelsRes.success) {
    const siblings = resolveSiblings(channelId, initialName, channelsRes.channels);
    if (siblings.length > 0) {
      setPropagateSiblings(siblings);
      setPropagateCandidates(candidates);
      setPropagateBarDismissed(false);
    }
  }
}
```

- [ ] **Step 4: Add the Review handler that builds the plan**

```typescript
const handleOpenPropagateReview = React.useCallback(async () => {
  const batch = await rockGetRunsheetDetailsBatch(propagateSiblings.map((s) => s.channelId));
  const targetRowsMap = new Map<number, RunsheetItemRow[]>();
  const matchResultsByChannel = new Map<number, MatchResult>();

  for (const result of batch) {
    if (!result.success || !result.data) continue;
    targetRowsMap.set(result.channelId, result.data.items);
    matchResultsByChannel.set(result.channelId, matchRows(processedRows, result.channelId, result.data.items));
  }

  setPropagateTargetRows(targetRowsMap);
  const plan = buildPropagationPlan(propagateCandidates, matchResultsByChannel, propagateSiblings, columns);
  setPropagatePlan(plan);
  setPropagateReviewOpen(true);
}, [propagateSiblings, propagateCandidates, processedRows, columns]);

const handlePropagateOverwrite = React.useCallback((targetChannelId: number, itemTitle: string, columnKey: string) => {
  setPropagatePlan((prev) => {
    if (!prev) return prev;
    return {
      targets: prev.targets.map((t) =>
        t.channel.channelId !== targetChannelId
          ? t
          : {
              ...t,
              changes: t.changes.map((c) =>
                c.itemTitle === itemTitle && c.columnKey === columnKey ? { ...c, selected: true } : c,
              ),
            },
      ),
    };
  });
}, []);

const handlePropagateApply = React.useCallback(async () => {
  if (!propagatePlan) return;
  setPropagateApplying(true);
  try {
    const outcomes = await executePropagationPlan(propagatePlan, propagateTargetRows, columns);
    setPropagateOutcomes(outcomes);
    if (outcomes.every((o) => o.ok)) {
      setPropagateReviewOpen(false);
      setPropagateBarDismissed(true);
    }
  } finally {
    setPropagateApplying(false);
  }
}, [propagatePlan, propagateTargetRows, columns]);
```

- [ ] **Step 5: Render the bar and the panel**

Find the JSX region where the save status message renders (near the Save button) and add, as a sibling:

```tsx
{propagateCandidates.length > 0 && !propagateBarDismissed && !propagateReviewOpen && (
  <div className="propagate-bar">
    <span>
      {propagateSiblings.length} other {extractChannelDateLabel(initialName)} service
      {propagateSiblings.length === 1 ? '' : 's'} — apply your {propagateCandidates.length} change
      {propagateCandidates.length === 1 ? '' : 's'}?
    </span>
    <button type="button" onClick={handleOpenPropagateReview}>Review</button>
    <button type="button" onClick={() => setPropagateBarDismissed(true)}>Dismiss</button>
  </div>
)}

{propagateReviewOpen && propagatePlan && (
  <PropagateReviewPanel
    plan={propagatePlan}
    onOverwrite={handlePropagateOverwrite}
    onApply={handlePropagateApply}
    applying={propagateApplying}
    outcomes={propagateOutcomes}
  />
)}
```

`extractChannelDateLabel` is a small local helper — add it near the top of the file:

```typescript
function extractChannelDateLabel(name: string): string {
  const parts = name.split('//');
  return parts.length >= 2 ? parts[1].trim() : '';
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx jest tests/unit/components/RunsheetTableEditor.propagate.test.tsx --verbose
```

Expected: PASS. Adjust the test's cell-edit simulation to match whatever helper the file already uses (check `tests/unit` for any existing `RunsheetTableEditor` render test to copy the pattern from) if the first attempt doesn't line up with the real DOM structure.

- [ ] **Step 7: Run the full suite**

```bash
npx jest tests/unit --verbose
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx tests/unit/components/RunsheetTableEditor.propagate.test.tsx
git commit -m "feat: propagate save-time changes to sibling runsheets with review"
```

---

## Task 10: `RunsheetCompareView` component

Read-only side-by-side grid for 2–4 sibling runsheets, with per-cell push into the same review panel.

**Files:**
- Create: `src/components/runsheet/RunsheetCompareView.tsx`
- Test: `tests/unit/components/RunsheetCompareView.test.tsx`

**Interfaces:**
- Consumes:
  - `rockGetRunsheetDetailsBatch` from `src/server-actions/rockGetRunsheetDetailsBatch.ts`
  - `matchRows` from `src/lib/runsheetMatch.ts`
  - `buildPropagationPlan`, `CandidateCellChange` from `src/lib/runsheetPropagate.ts`
  - `executePropagationPlan` from `src/lib/runsheetPropagateExecute.ts`
  - `PropagateReviewPanel` from `src/components/runsheet/PropagateReviewPanel.tsx`
  - `isPersonColumn` from `src/constants/runsheetColumns.ts`
- Produces:
  ```typescript
  interface RunsheetCompareViewProps {
    channelIds: number[];
    onClose: () => void;
  }

  function RunsheetCompareView(props: RunsheetCompareViewProps): JSX.Element
  ```
  Consumed by Task 11 (`RunsheetManager`).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/RunsheetCompareView.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunsheetCompareView } from '@/components/runsheet/RunsheetCompareView';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';

jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');

function detail(channelId: number, time: string, notes: string) {
  return {
    channelId,
    success: true,
    data: {
      channelId,
      name: `MNL Crowne // Aug 16, 2026 // ${time}`,
      contentChannelTypeId: 13,
      columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
      items: [{ id: channelId * 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: notes } }],
    },
  };
}

describe('RunsheetCompareView', () => {
  beforeEach(() => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      detail(1, '9AM', 'Doors open 8:30'),
      detail(2, '11:30AM', 'Doors open 9:00'),
    ]);
  });

  it('renders one column per channel and shows differing cells with full contrast', async () => {
    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('9AM')).toBeInTheDocument());
    expect(screen.getByText('11:30AM')).toBeInTheDocument();
    expect(screen.getByText('Doors open 8:30')).toBeInTheDocument();
    expect(screen.getByText('Doors open 9:00')).toBeInTheDocument();
  });

  it('shows a Push to others action on a differing cell that opens the review panel', async () => {
    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Doors open 8:30')).toBeInTheDocument());

    fireEvent.mouseEnter(screen.getByText('Doors open 8:30'));
    fireEvent.click(screen.getByRole('button', { name: /push/i }));

    await waitFor(() => expect(screen.getByRole('region', { name: /propagate/i })).toBeInTheDocument());
  });

  it('hides person and platform columns by default', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 9AM',
          contentChannelTypeId: 13,
          columns: [{ id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 }],
          items: [{ id: 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { PLATFORM: 'Jane Doe' } }],
        },
      },
    ]);
    render(<RunsheetCompareView channelIds={[1]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/components/RunsheetCompareView.test.tsx --verbose
```

Expected: FAIL with "Cannot find module '@/components/runsheet/RunsheetCompareView'".

- [ ] **Step 3: Implement the component**

```tsx
// src/components/runsheet/RunsheetCompareView.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { matchRows, type MatchResult } from '@/lib/runsheetMatch';
import { buildPropagationPlan, type CandidateCellChange, type PropagationPlan } from '@/lib/runsheetPropagate';
import { executePropagationPlan, type PropagationOutcome } from '@/lib/runsheetPropagateExecute';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { PropagateReviewPanel } from './PropagateReviewPanel';

interface RunsheetCompareViewProps {
  channelIds: number[];
  onClose: () => void;
}

interface LoadedSheet {
  channelId: number;
  name: string;
  time: string;
  columns: DynamicAttributeColumn[];
  items: RunsheetItemRow[];
}

const PLATFORM_COLUMN_KEYS = ['ANCHORPREACHER', 'MAININSTRUMENT', 'LEDLIVESCREENS', 'LED WALL', 'OVERLAYBROADCAST', 'LIGHTING', 'AUDIO'];

function isPropagatableColumn(column: DynamicAttributeColumn): boolean {
  if (isPersonColumn(column)) return false;
  return !PLATFORM_COLUMN_KEYS.includes(column.key.toUpperCase());
}

export function RunsheetCompareView({ channelIds, onClose }: RunsheetCompareViewProps) {
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPeopleColumns, setShowPeopleColumns] = useState(false);
  const [pushPlan, setPushPlan] = useState<PropagationPlan | null>(null);
  const [pushTargetRows, setPushTargetRows] = useState<Map<number, RunsheetItemRow[]>>(new Map());
  const [pushApplying, setPushApplying] = useState(false);
  const [pushOutcomes, setPushOutcomes] = useState<PropagationOutcome[] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const batch = await rockGetRunsheetDetailsBatch(channelIds);
      if (!active) return;
      const loaded = batch
        .filter((r) => r.success && r.data)
        .map((r) => ({
          channelId: r.channelId,
          name: r.data!.name,
          time: r.data!.name.split('//').pop()?.trim() || '',
          columns: r.data!.columns,
          items: r.data!.items,
        }));
      setSheets(loaded);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [channelIds]);

  const allColumns = useMemo(() => {
    const seen = new Map<string, DynamicAttributeColumn>();
    for (const sheet of sheets) {
      for (const col of sheet.columns) {
        if (!showPeopleColumns && !isPropagatableColumn(col)) continue;
        if (!seen.has(col.key)) seen.set(col.key, col);
      }
    }
    return Array.from(seen.values());
  }, [sheets, showPeopleColumns]);

  const rowTitles = useMemo(() => {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const sheet of sheets) {
      for (const item of sheet.items) {
        const title = item.attributeValues?.ACTIVITYTITLE || item.title;
        if (!seen.has(title)) {
          seen.add(title);
          titles.push(title);
        }
      }
    }
    return titles;
  }, [sheets]);

  const cellValue = (sheet: LoadedSheet, itemTitle: string, columnKey: string): string | null => {
    const item = sheet.items.find((i) => (i.attributeValues?.ACTIVITYTITLE || i.title) === itemTitle);
    if (!item) return null;
    return item.attributeValues?.[columnKey] ?? '';
  };

  const handlePush = async (sourceSheet: LoadedSheet, itemTitle: string, columnKey: string, columnName: string, newValue: string) => {
    const others = sheets.filter((s) => s.channelId !== sourceSheet.channelId);
    const matchResultsByChannel = new Map<number, MatchResult>();
    const targetRowsMap = new Map<number, RunsheetItemRow[]>();

    for (const target of others) {
      matchResultsByChannel.set(target.channelId, matchRows(sourceSheet.items, target.channelId, target.items));
      targetRowsMap.set(target.channelId, target.items);
    }

    const candidate: CandidateCellChange = {
      itemTitle,
      columnKey,
      columnName,
      newValue,
      previousValue: newValue,
    };

    const siblings = others.map((s) => ({ channelId: s.channelId, name: s.name, time: s.time, preselected: true }));
    const plan = buildPropagationPlan([candidate], matchResultsByChannel, siblings, sourceSheet.columns);

    // A direct compare-view push has no "previous value" to detect divergence
    // against — every candidate cell is forced clean/selected so it behaves
    // as an explicit one-off overwrite rather than being held back.
    const forcedPlan: PropagationPlan = {
      targets: plan.targets.map((t) => ({
        ...t,
        changes: t.changes.map((c) => (c.status === 'unmatched' ? c : { ...c, status: 'clean' as const, selected: true })),
      })),
    };

    setPushTargetRows(targetRowsMap);
    setPushPlan(forcedPlan);
    setPushOutcomes(undefined);
  };

  const handlePushApply = async () => {
    if (!pushPlan) return;
    setPushApplying(true);
    try {
      const outcomes = await executePropagationPlan(pushPlan, pushTargetRows, allColumns);
      setPushOutcomes(outcomes);
      if (outcomes.every((o) => o.ok)) setPushPlan(null);
    } finally {
      setPushApplying(false);
    }
  };

  if (loading) return <div>Loading comparison…</div>;

  return (
    <div className="runsheet-compare-view">
      <div className="runsheet-compare-header">
        <button type="button" onClick={onClose}>Close</button>
        <label>
          <input type="checkbox" checked={showPeopleColumns} onChange={(e) => setShowPeopleColumns(e.target.checked)} />
          Show people/platform columns
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Segment</th>
            {sheets.map((s) => <th key={s.channelId}>{s.time}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowTitles.map((title) =>
            allColumns.map((col) => {
              const values = sheets.map((s) => cellValue(s, title, col.key));
              const distinctValues = new Set(values.filter((v) => v !== null));
              const differs = distinctValues.size > 1;

              return (
                <tr key={`${title}::${col.key}`}>
                  <td>{title} · {col.name}</td>
                  {sheets.map((s, i) => {
                    const value = values[i];
                    if (value === null) return <td key={s.channelId} className="runsheet-compare-gap">—</td>;
                    return (
                      <td key={s.channelId} className={differs ? 'runsheet-compare-diff' : 'runsheet-compare-same'}>
                        {value}
                        {differs && (
                          <button
                            type="button"
                            aria-label={`Push ${title} ${col.name} from ${s.time}`}
                            onClick={() => handlePush(s, title, col.key, col.name, value)}
                          >
                            ⤳ Push to others
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>

      {pushPlan && (
        <PropagateReviewPanel
          plan={pushPlan}
          onOverwrite={() => {}}
          onApply={handlePushApply}
          applying={pushApplying}
          outcomes={pushOutcomes}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/components/RunsheetCompareView.test.tsx --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/RunsheetCompareView.tsx tests/unit/components/RunsheetCompareView.test.tsx
git commit -m "feat: add read-only side-by-side runsheet compare view"
```

---

## Task 11: Compare entry point in `RunsheetManager`

Adds multi-select to the runsheet list and a "Compare" action that opens `RunsheetCompareView` for 2–4 selected channels.

**Files:**
- Modify: `src/components/runsheet/RunsheetManager.tsx`
- Test: `tests/unit/components/RunsheetManager.compare.test.tsx`

**Interfaces:**
- Consumes: `RunsheetCompareView` from `src/components/runsheet/RunsheetCompareView.tsx`
- Produces: no new exports; internal state `compareSelection: Set<number>`, `compareViewOpen: boolean`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/RunsheetManager.compare.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/components/runsheet/RunsheetCompareView', () => ({
  RunsheetCompareView: ({ channelIds, onClose }: { channelIds: number[]; onClose: () => void }) => (
    <div data-testid="compare-view">{channelIds.join(',')}<button onClick={onClose}>close</button></div>
  ),
}));

describe('RunsheetManager compare entry point', () => {
  beforeEach(() => {
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
        { id: 2, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
      ],
    });
  });

  it('enables Compare only once 2 or more channels are checked, and opens the compare view with those ids', async () => {
    render(<RunsheetManager />);
    await waitFor(() => expect(screen.getByText(/9AM/)).toBeInTheDocument());

    const compareButton = screen.getByRole('button', { name: /compare/i });
    expect(compareButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /select for compare/i })[0]);
    expect(compareButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /select for compare/i })[1]);
    expect(compareButton).toBeEnabled();

    fireEvent.click(compareButton);
    expect(screen.getByTestId('compare-view')).toHaveTextContent('1,2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/unit/components/RunsheetManager.compare.test.tsx --verbose
```

Expected: FAIL — no "select for compare" checkboxes or Compare button exist yet.

- [ ] **Step 3: Add multi-select state and the Compare button**

Read the section of `RunsheetManager.tsx` that renders the channel list (search for `availableChannels.map` or similar) before editing, to place the checkbox correctly per row without disturbing the existing click-to-open behavior. Add near the other `useState` calls:

```typescript
import { RunsheetCompareView } from './RunsheetCompareView';

// ...
const [compareSelection, setCompareSelection] = useState<Set<number>>(new Set());
const [compareViewOpen, setCompareViewOpen] = useState(false);

const toggleCompareSelection = (id: number) => {
  setCompareSelection((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    return next;
  });
};
```

In the channel list item's JSX, add a checkbox before the existing clickable row content (using `stopPropagation` so it doesn't also trigger opening the runsheet):

```tsx
<input
  type="checkbox"
  aria-label="Select for compare"
  checked={compareSelection.has(channel.id)}
  onClick={(e) => e.stopPropagation()}
  onChange={() => toggleCompareSelection(channel.id)}
/>
```

Near the list, add the Compare button and the modal-style render:

```tsx
<button
  type="button"
  disabled={compareSelection.size < 2}
  onClick={() => setCompareViewOpen(true)}
>
  Compare
</button>

{compareViewOpen && (
  <RunsheetCompareView
    channelIds={Array.from(compareSelection)}
    onClose={() => setCompareViewOpen(false)}
  />
)}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/unit/components/RunsheetManager.compare.test.tsx --verbose
```

Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

```bash
npx jest tests/unit --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/runsheet/RunsheetManager.tsx tests/unit/components/RunsheetManager.compare.test.tsx
git commit -m "feat: add multi-select Compare entry point to the runsheet list"
```

---

## Task 12: Integration test — write path and failure isolation

Confirms end-to-end that a propagated cell issues exactly one `changedKeys` write per selected target, that unselected targets issue none, and that one target's failure doesn't affect the others' outcomes — covering the plan's own "Integration" test section against real (mocked-at-the-Rock-boundary) server actions rather than the in-memory unit doubles used in Task 7.

**Files:**
- Test: `tests/integration/runsheetPropagate.integration.test.ts`

**Interfaces:**
- Consumes: `executePropagationPlan` from `src/lib/runsheetPropagateExecute.ts`; `rockBulkSaveRunsheetItems` from `src/server-actions/rockBulkSaveRunsheetItems.ts` (mocked only at the `rockFetch` boundary, i.e. `@/server-actions/internal/rockFetch`, so the real save logic runs)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/runsheetPropagate.integration.test.ts
import { executePropagationPlan } from '@/lib/runsheetPropagateExecute';
import * as rockFetch from '@/server-actions/internal/rockFetch';
import type { PropagationPlan } from '@/lib/runsheetPropagate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('@/server-actions/internal/rockFetch');

function targetRow(id: number, title: string): RunsheetItemRow {
  return { id, title, order: 1, duration: 5, attributeValues: { NOTES: 'old' } };
}

describe('propagation write path (integration)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues exactly one PATCH to ContentChannelItems and one AttributeValues write per selected target, and none for an unselected target', async () => {
    const patchCalls: { url: string; body: any }[] = [];
    (rockFetch.rockPatch as jest.Mock) = jest.fn(async (url: string, body: any) => {
      patchCalls.push({ url, body });
      return {};
    });
    (rockFetch.rockGet as jest.Mock) = jest.fn(async (url: string) => {
      if (url.includes('AttributeValues')) return [];
      return {};
    });
    (rockFetch.rockPost as jest.Mock) = jest.fn(async () => ({ Id: 999 }));

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true },
          ],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [
            { itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'different', status: 'diverged', selected: false },
          ],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, [{ id: 1, key: 'NOTES', name: 'Notes' }]);

    expect(outcomes.find((o) => o.channelId === 2)?.appliedCount).toBe(1);
    expect(outcomes.find((o) => o.channelId === 3)?.appliedCount).toBe(0);

    const itemPatches = patchCalls.filter((c) => c.url.includes('ContentChannelItems/10'));
    expect(itemPatches).toHaveLength(1);
    const attributePosts = (rockFetch.rockPost as jest.Mock).mock.calls.filter(([url]: [string]) => url.includes('AttributeValues'));
    expect(attributePosts).toHaveLength(1);

    const target3Patches = patchCalls.filter((c) => c.url.includes('ContentChannelItems/20'));
    expect(target3Patches).toHaveLength(0);
  });

  it('reports channel 3 as ok:false and leaves channel 2 ok:true when only channel 3 times out', async () => {
    let callCount = 0;
    (rockFetch.rockPatch as jest.Mock) = jest.fn(async (url: string) => {
      callCount += 1;
      if (url.includes('ContentChannelItems/20')) throw new Error('Rock timeout');
      return {};
    });
    (rockFetch.rockGet as jest.Mock) = jest.fn(async () => []);
    (rockFetch.rockPost as jest.Mock) = jest.fn(async () => ({ Id: 999 }));

    const plan: PropagationPlan = {
      targets: [
        {
          channel: { channelId: 2, name: 'X // Aug 16, 2026 // 9AM', time: '9AM', preselected: true },
          changes: [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true }],
        },
        {
          channel: { channelId: 3, name: 'X // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
          changes: [{ itemTitle: 'Welcome', columnKey: 'NOTES', columnName: 'Notes', newValue: 'new', sourcePreviousValue: 'old', targetCurrentValue: 'old', status: 'clean', selected: true }],
        },
      ],
    };

    const targetRows = new Map([[2, [targetRow(10, 'Welcome')]], [3, [targetRow(20, 'Welcome')]]]);
    const outcomes = await executePropagationPlan(plan, targetRows, [{ id: 1, key: 'NOTES', name: 'Notes' }]);

    expect(outcomes.find((o) => o.channelId === 2)?.ok).toBe(true);
    expect(outcomes.find((o) => o.channelId === 3)?.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/integration/runsheetPropagate.integration.test.ts --verbose
```

Expected: FAIL initially (or reveal a mismatch between the assumed `rockFetch` export names/signatures and the real ones — open `src/server-actions/internal/rockFetch.ts` if the mock shape doesn't line up, and adjust the mock to match its real `rockGet`/`rockPost`/`rockPatch` signatures before treating this as a genuine failure).

- [ ] **Step 3: No new implementation code — this task only adds test coverage**

If Step 2 fails for a reason other than "not yet passing" (e.g. a signature mismatch), fix the test's mock shape to match `src/server-actions/internal/rockFetch.ts`'s real exports. `executePropagationPlan` and `rockBulkSaveRunsheetItems` are both already implemented by Tasks 1 and 7.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/integration/runsheetPropagate.integration.test.ts --verbose
```

Expected: PASS.

- [ ] **Step 5: Run the entire test suite one last time**

```bash
npx jest --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/runsheetPropagate.integration.test.ts
git commit -m "test: add integration coverage for propagation write path and failure isolation"
```
