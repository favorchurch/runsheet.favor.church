# Inline Per-Cell Service Diff — Implementation Plan

## Source
- Issue: https://github.com/favorchurch/runsheet.favor.church/issues/61
- PR: https://github.com/favorchurch/runsheet.favor.church/pull/64
- Baseline inspected: `main` at `e9093be0ebc5e5834c737eb9f264d7b38664208f`

## Goal
Let a user choose one same-campus, same-date sibling service and see a Git-style diff in the active runsheet footprint: unchanged cells stay calm, current/source removals are muted in parentheses, and comparison additions are highlighted yellow.

## Scope
### In scope
- One sibling comparison at a time.
- Compact red `−`, center `Diff`, green `+` control.
- Same-campus/date sibling resolution.
- Read-only target loading without navigation.
- Cell states: same, changed, removed, added.
- Explicit source-only and target-only segments.
- Existing visible dynamic/person/platform columns.
- Computed Start and Duration values.
- View-only users.
- Mobile-safe stacked old/new values.
- Existing full-screen Compare remains available.
- Semver bump to `1.14.0`.

### Out of scope
- Editing the comparison service.
- Multi-target inline diff.
- Cross-campus/date comparison.
- Propagation/push from this surface.
- Rock schema changes or migrations.

## Repository evidence
| Path / symbol | Current responsibility | Implementation use |
| --- | --- | --- |
| `src/components/runsheet/RunsheetManager.tsx` | Active channel, editor mode, full-screen Compare | Switches the table import to the inline-diff wrapper while preserving existing manager behavior. |
| `src/components/runsheet/RunsheetTableEditor.tsx` | Existing single-runsheet editor/save state | Kept mounted and unchanged beneath the wrapper so normal editing/save behavior remains authoritative. |
| `src/components/runsheet/RunsheetTableEditorDiff.tsx` | New wrapper | Owns `− Diff +`, read-only target loading, and diff-table presentation. |
| `src/lib/runsheetSiblings.ts` | Same-campus/date sibling selection | Reused directly. |
| `src/lib/runsheetMatch.ts` | `SIBLINGKEY` then unique-title matching | Reused; backfill output is ignored so visual diff cannot write. |
| `src/lib/runsheetInlineDiff.ts` | New pure diff model | Computes cell/row states and target-only alignment without server actions. |
| `src/server-actions/rockGetAvailableRunsheetChannels.ts` | Authorized channel discovery | Wrapper uses the existing authenticated read path to discover eligible siblings. |
| `src/server-actions/rockGetRunsheetDetailsBatch.ts` | Authorized batch details read | Loads exactly the selected target service. |
| `src/components/runsheet/RichTextContent.tsx` | Sanitized read-only cell renderer | Used for both removed and added values. |

## Target behavior
- Same value: render normally once.
- Changed value: source/current value first, muted and parenthesized; target value below in yellow.
- Removed value: source/current muted and parenthesized only.
- Added value: target yellow only.
- Source-only row: keep the row and mark it absent in the target.
- Target-only row: insert a synthetic read-only added row near the nearest matched neighbor.
- Ambiguous duplicate titles are never matched by position.
- Selecting/switching/clearing Diff performs reads only.

## Implementation
### 1. Pure diff model
`src/lib/runsheetInlineDiff.ts`:
- filters non-schedule roster placeholder rows;
- computes displayed Start/Duration values for both services;
- normalizes rich-text values to rendered text + attached URL for equality;
- delegates row correspondence to `matchRows`;
- ignores `matchRows.backfill` entirely;
- classifies `same | changed | removed | added` per cell;
- inserts unmatched target rows deterministically around matched neighbors.

### 2. Inline diff wrapper
`src/components/runsheet/RunsheetTableEditorDiff.tsx`:
- wraps the existing editor rather than refactoring its large single-sheet state model;
- discovers authorized channels through `rockGetAvailableRunsheetChannels(false)` and narrows them with `resolveSiblings`;
- loads the selected target using `rockGetRunsheetDetailsBatch([id])`;
- uses a request version guard so stale target responses cannot win after fast switching/clearing;
- keeps the base editor mounted while Diff is active, but hides it and renders a read-only diff table;
- disables entering Diff while the source has unsaved edits. This is an intentional implementation tightening: it avoids comparing persisted target data against an unstable source state and guarantees clearing Diff returns to the exact mounted editor state;
- never imports a Rock mutation action.

### 3. Manager integration
`RunsheetManager.tsx` imports the wrapper under the existing `RunsheetTableEditor` symbol. No existing Compare, navigation, save, optimistic-cache, or permission flow is removed.

### 4. Tests
Added:
- `tests/unit/lib/runsheetInlineDiff.test.ts`
  - classification of same/change/remove/add;
  - computed Start change;
  - `SIBLINGKEY` match across rename;
  - ambiguous duplicate titles remain unmatched;
  - deterministic target-only insertion.
- `tests/unit/components/RunsheetTableEditor.diff.test.tsx`
  - view-only access;
  - sibling selection and target read;
  - same/change/remove/add DOM states;
  - red minus clearing;
  - no Rock bulk-save calls;
  - dirty-source Diff lockout.

Existing full-screen Compare tests remain in place as regression coverage.

## Security / data
- No migration or schema change.
- Sibling discovery and target details both go through existing authenticated/authorized server actions.
- Diff model contains no server action or mutation dependency.
- `matchRows` backfill metadata is never persisted.
- Synthetic target-only rows exist only in the rendered diff model and never enter source `items` state.

## Validation
Repository commands:
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Validation evidence during implementation:
- Focused extracted TypeScript harness for the pure diff model passed classification, computed timing, `SIBLINGKEY`, ambiguous-title, and target-only alignment cases.
- New TS/TSX implementation/test files were syntax-transpiled with TypeScript without diagnostics before push.
- Vercel preview build for the branch completed successfully after the implementation commits, providing full-project build/type integration evidence.
- The local execution sandbox does not contain the repo's installed React/Jest dependencies and has no network access, so the newly committed Jest suite could not be executed there. The tests are committed for normal repo/CI execution and this limitation must not be represented as a Jest pass.

## Acceptance criteria mapping
- [x] `− Diff +` selection UI implemented.
- [x] Selected service loads without navigation.
- [x] Same cells render without diff decoration.
- [x] Changed cells render muted current + yellow target.
- [x] Pure removals render muted current only.
- [x] Pure additions render yellow target only.
- [x] Row matching reuses `SIBLINGKEY` / unique-title logic, never row index.
- [x] Missing rows are explicit.
- [x] Diff code path contains no Rock writes; component tests assert bulk-save is not called.
- [x] Existing full-screen Compare remains intact.
- [x] Values stack inside the source table footprint rather than adding another service column.
- [x] Focused unit/component tests are committed.

## Rollout / rollback
No backend ordering is required. This is a client/read-only feature with a normal semver minor release. Rollback is a code revert; there is no persisted diff state or Rock cleanup.

## Residual validation
Before merging, run the committed Jest tests (or full `pnpm test`) in a dependency-complete environment. Manual authenticated smoke testing should verify a real 3PM → 5:30PM pair on desktop/mobile and confirm network activity remains read-only while selecting/clearing Diff.
