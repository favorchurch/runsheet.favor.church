# Inline Per-Cell Service Diff - Implementation Plan

## Source
- Issue: https://github.com/favorchurch/runsheet.favor.church/issues/61
- Repository/ref inspected: `favorchurch/runsheet.favor.church` `main` at `e9093be0ebc5e5834c737eb9f264d7b38664208f`
- User reference: current runsheet table on `runsheet.favor.church`, comparing a current service such as 3:00 PM against a sibling such as 5:30 PM.

## Goal
Let a user choose one same-campus, same-date sibling service and see a Git-style diff directly inside the active runsheet table: unchanged cells stay normal, source removals are muted in parentheses, and comparison additions are highlighted yellow.

## Scope
### In scope
- One comparison sibling at a time.
- A compact `− Diff +` control in the active runsheet surface; red `−`, green `+`.
- Same-campus, same-date sibling selection using the existing sibling resolver.
- Read-only comparison data loaded without navigation.
- Per-cell unchanged / replaced / removed / added rendering in the existing table footprint.
- Explicit source-only and target-only segment handling without positional guessing.
- Existing visible person/platform columns participate in inline diff.
- Computed Start and Duration values participate in diff.
- View-mode support, including users who cannot edit.
- Mobile-safe stacked values inside each cell.
- Regression coverage for the existing full-screen Compare and edit/save flows.
- Semver feature version bump during implementation.

### Out of scope
- Replacing the existing 2–4 service full-screen Compare view.
- Editing or saving the comparison service from inline Diff.
- Multi-target inline Diff.
- Cross-campus or cross-date inline Diff.
- Automatic propagation/push from inline Diff.
- Rock schema changes or migrations.

## Repository evidence
| Path / symbol | Current responsibility / observed behavior | Why it matters |
| --- | --- | --- |
| `src/components/runsheet/RunsheetManager.tsx` | Owns the active channel, the access-filtered `availableChannels`, view/edit mode, and the existing full-screen Compare entry point. It passes the active data into `RunsheetTableEditor`. | The editor needs the already-authorized channel list so it can offer only eligible sibling services without creating a second discovery path. |
| `src/components/runsheet/RunsheetTableEditor.tsx` | Owns the current table, cell rendering, computed row timing, edit/save behavior, and already imports `resolveSiblings`, `matchRows`, and `rockGetRunsheetDetailsBatch` for propagation workflows. | Inline Diff belongs here because the requirement is to keep the current table shape and render the diff inside each existing cell. |
| `src/lib/runsheetSiblings.ts` / `resolveSiblings` | Returns channels with the same campus and date, excluding the source channel. | Reuse this instead of inventing separate service-pairing rules. |
| `src/lib/runsheetMatch.ts` / `matchRows` | Matches source rows to target rows by `SIBLINGKEY`, then unique title, otherwise reports `none`; title fallback also returns optional backfill metadata. | Reuse its matching semantics, but inline Diff must ignore backfill and perform no writes. |
| `src/server-actions/rockGetRunsheetDetailsBatch.ts` | Read-only fan-out over `rockGetRunsheetDetails`; already used by Compare/propagation. | Existing read boundary is sufficient for loading the selected sibling; no new server action is required. |
| `src/components/runsheet/RichTextContent.tsx` | Read-only rich-text renderer using legacy conversion plus DOMPurify sanitization, with plain-text hydration fallback. | Both removed and added rich-text values should go through this renderer rather than introducing a new unsafe HTML path. |
| `src/components/runsheet/RunsheetCompareView.tsx` | Existing separate overlay that loads multiple sheets and computes value differences, including derived Start/Duration values. | Inline Diff should coexist with this surface and can reuse its comparison conventions without duplicating its side-by-side UI. |
| `tests/unit/lib/runsheetMatch.test.ts` and `tests/unit/lib/runsheetSiblings.test.ts` | Cover sibling resolution and non-positional row matching behavior. | New tests should build on these guarantees instead of restating all matching logic. |
| `tests/unit/components/RunsheetManager.compare.test.tsx` | Protects the current full-screen Compare entry point. | Must remain green after the inline workflow is added. |
| `package.json` | Current version is `1.13.2`; repo instructions require semver version updates. | This backward-compatible feature should bump the app to `1.14.0` during implementation. |

## Current state
The active runsheet is a single-sheet grid rendered by `RunsheetTableEditor`. A separate `RunsheetCompareView` can compare several services in an overlay, but it changes the visual model to service columns and does not provide a Git-style old/new rendering inside the current table.

The codebase already has the required primitives: access-filtered channel discovery in the manager, same-date/campus sibling selection, row correspondence via sibling key/title, a batch details reader, safe read-only rich-text rendering, and calculated timing logic. No Rock write or schema change is necessary for this feature.

## Target state
An open runsheet exposes `− Diff +`. The green `+` selects or changes one eligible sibling; the red `−` clears the active comparison. While a sibling is selected, the current table remains the spatial reference:

- Same value: render exactly as the normal current cell.
- Replacement: render current/source value muted and parenthesized, then comparison value in a yellow-highlighted block beneath it.
- Removal: render only the current/source value muted and parenthesized.
- Addition: render only the comparison value in yellow.
- Source-only segment: keep the source row and render it as removed/unmatched rather than pairing it by index.
- Target-only segment: render a synthetic diff-only added row in the same table, positioned relative to the nearest matched target neighbor, with populated target cells highlighted yellow.

Diff mode is visual only. Selecting, changing, or clearing the comparison never calls a Rock write action. Comparison values are never editable.

## Implementation approach

### 1. Add a pure inline-diff model
- Proposed file: `src/lib/runsheetInlineDiff.ts`.
- Define a small pure model for `same | changed | removed | added | unmatched` cell/row states.
- Feed it source rows, target rows, source/target computed timing values, and the visible dynamic columns.
- Use `matchRows` for source-to-target correspondence; discard its `backfill` output entirely in this read-only workflow.
- Track matched target row IDs and classify remaining target rows as target-only additions.
- Align synthetic target-only rows by target order around the nearest matched predecessor/successor; never pair rows solely because their array indices happen to match.
- Compare rich-text cell values using normalized rendered content rather than raw storage syntax so legacy markers and equivalent sanitized HTML do not create false visual differences. Preserve actual visible formatting changes where practical; document/test the normalization contract.
- For Start and Duration, compare the same formatted values the table displays, not raw Rock timestamps.
- Keep this helper free of server actions and state so it is easy to prove that diff computation cannot write.

### 2. Wire sibling availability and selection into the active editor
- Update `RunsheetManager` to pass its existing access-filtered `availableChannels` into `RunsheetTableEditor`.
- Add an optional `availableChannels` prop to the editor.
- In the editor, memoize `resolveSiblings(channelId, channelName, availableChannels)`.
- Add local diff state: selected sibling ID, target details, loading/error state.
- Load exactly the selected sibling with the existing `rockGetRunsheetDetailsBatch([id])` read path. Ignore stale responses if the user rapidly switches targets or clears Diff.
- Do not call `rockGetAvailableRunsheetChannels` from a new path just for Diff; the manager already owns the authorized result set.
- Show the control in view and edit modes whenever at least one sibling exists. Proposed interaction:
  - green `+`: open the sibling picker; if already active, it changes the target;
  - center `Diff`: opens the same picker / shows the selected target label;
  - red `−`: clear the target and return to the normal table.
- Use time-first labels (`5:30 PM`) with enough service context to disambiguate if names are unusual.
- If loading fails, leave the source table untouched and show a compact retry/error state; never partially apply stale target data.

### 3. Render the diff through the existing table/cell pipeline
- Keep the source runsheet's column order and widths as the table layout authority.
- Introduce a small proposed presentational component/helper such as `InlineDiffCell` under `src/components/runsheet/` or a focused local renderer in `RunsheetTableEditor` if it remains small.
- For unchanged values, call the existing normal renderer with no extra wrapper so `Runsheet Huddle`-style identical cells look exactly as they do today.
- For removed source content, render a muted parenthesized wrapper. Rich text still renders through `RichTextContent` inside that wrapper.
- For added target content, stack it below the source/removal and use an amber/yellow background/border treatment with sufficient contrast.
- Person cells should reuse `parsePeopleString` / existing person display semantics; the target branch is display-only.
- Music/title cells should retain the source song-detail affordance only for the source value; do not make the target diff branch interactive.
- While Diff is active, suppress direct cell editing for the diff-rendered grid even if the manager remains in edit mode. Clearing Diff returns the user to the same prior editor mode. This prevents an ambiguous mixed edit/diff state and provides a hard UI guarantee that comparison mode itself has no write path.
- Keep non-cell editor state (selected service, existing dirty source changes, editor mode) intact. If the source already has unsaved edits before Diff is entered, compare against the currently displayed source values and do not mutate the baseline/save state.
- If source data changes locally while Diff is active through a non-cell control, recompute the visual diff from current source state; never copy target values into source state.

### 4. Handle structural differences explicitly
- Source row with no target match: show an inline muted `segment absent in <target time>` marker and treat its source cell values as removals.
- Target-only row: render a non-editable synthetic added row using the target's visible values, highlighted yellow, inserted by the alignment rule from step 1.
- If title fallback is ambiguous, keep the rows unmatched. Do not guess. Legacy rows whose titles changed and lack `SIBLINGKEY` may therefore appear as a remove + add pair; this is preferable to showing a false match.
- Do not persist `SIBLINGKEY` backfills from visual Diff.

### 5. Preserve the existing Compare and write boundaries
- Do not remove or repurpose `RunsheetCompareView` or the existing `Compare` button.
- Do not route inline Diff through `rockBulkSaveRunsheetItems`, propagation execution, or any target write helper.
- Keep current save/dirty computation unchanged except for making sure diff-only synthetic rows are never inserted into the editor's `items` state.
- Add regression assertions that selecting/clearing Diff only invokes read actions.

### 6. Tests and versioning
- Proposed `tests/unit/lib/runsheetInlineDiff.test.ts`:
  - identical cells => `same`;
  - replacement => old + new;
  - source-only value => `removed`;
  - target-only value => `added`;
  - SIBLINGKEY match survives title/order change;
  - ambiguous/missing row is not positionally paired;
  - target-only row alignment is deterministic;
  - computed Start/Duration changes classify correctly.
- Proposed `tests/unit/components/RunsheetTableEditor.diff.test.tsx`:
  - `− Diff +` visible to a view-only user with eligible siblings;
  - `+` selects a sibling and performs only a detail read;
  - unchanged cell stays normal;
  - replacement/removal/addition DOM and classes match the requested visual semantics;
  - red `−` clears the diff and restores normal rendering;
  - target value is non-editable;
  - source editing is suppressed only while Diff is active and restored after clear;
  - no call to `rockBulkSaveRunsheetItems` or propagation execution from selection/render/clear.
- Keep `tests/unit/components/RunsheetManager.compare.test.tsx` green as regression coverage for full-screen Compare.
- Update/add focused layout coverage if synthetic added rows affect row spans or mobile card/table modes.
- During implementation bump `package.json` from `1.13.2` to `1.14.0` per the repository semver instruction; update lock metadata only if the package manager changes it.

## Data / migration considerations
None. Diff state is client-local and the target sheet is read through existing authenticated server actions. No Rock attributes, ContentChannelItems, or migrations are added.

## Security / permissions
- Sibling candidates come from `RunsheetManager`'s already-authorized `availableChannels` result and are further narrowed by `resolveSiblings`.
- Target details continue through `rockGetRunsheetDetails` via `rockGetRunsheetDetailsBatch`, preserving the existing per-channel read authorization boundary.
- Inline Diff is available to view-only users because it is a read feature; no new edit privilege is introduced.
- No backfill or write side effect is allowed from visual matching.

## Validation
Commands are repository-declared but were not executed during planning:
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Focused checks during implementation:
- `pnpm test -- --runInBand tests/unit/lib/runsheetInlineDiff.test.ts tests/unit/components/RunsheetTableEditor.diff.test.tsx tests/unit/components/RunsheetManager.compare.test.tsx`
- Manual desktop: open 3:00 PM, diff against 5:30 PM, verify an identical row such as Runsheet Huddle is visually unchanged and a changed value shows old-muted/new-yellow.
- Manual add/remove: verify blank-to-value, value-to-blank, source-only row, and target-only row states.
- Manual mobile: verify old/new values stack inside the existing cell width and synthetic rows do not force a new service column.
- Manual permissions: repeat with a view-only account; Diff should work while all target content remains non-editable.
- Browser/network verification: selecting, switching, and clearing Diff must issue reads only and no Rock mutation request.

## Acceptance criteria mapping
- [ ] Select one sibling via `− Diff +` -> component test + manual 3:00 PM / 5:30 PM flow.
- [ ] No navigation to another service -> manager/editor component test and URL manual check.
- [ ] Identical cells have no diff noise -> pure helper + renderer test.
- [ ] Replacement = muted parenthesized source + yellow target -> renderer test.
- [ ] Removal = muted parenthesized source only -> renderer test.
- [ ] Addition = yellow target only -> renderer test.
- [ ] No positional row matching -> helper tests around SIBLINGKEY/title/ambiguous cases.
- [ ] Missing rows explicit -> structural-diff tests.
- [ ] Diff performs no writes -> mocked write-action assertions + browser network check.
- [ ] Existing edit/save and full-screen Compare remain -> existing compare tests + full suite.
- [ ] Mobile remains usable -> responsive/manual validation plus any affected layout test.

## Rollout / rollback
No migration or backend deployment ordering is required. Ship as a normal app release after tests/build pass. Rollback is a code revert to the previous client UI; no persisted diff state or Rock data needs cleanup.

## Risks and assumptions
- Legacy rows without `SIBLINGKEY` that have different titles cannot be safely identified as the same row. They will intentionally appear unmatched rather than be guessed.
- Target-only row insertion must not alter the source `items` array, dirty tracking, drag ordering, row-span calculations, or save payload.
- Rich-text equality needs one explicit normalization contract. Prefer comparing sanitized/normalized display content; markup-only differences that render identically should not create noise.
- Inline Diff is intentionally display-only while active. This avoids the high-risk case where a user mistakes the yellow comparison branch for editable source content; clearing Diff restores the previous view/edit mode.

## Review notes
Self-review and an internal adversarial fallback were applied before the initial commit. The plan was tightened around four failure modes: accidentally implementing in `rsvp.favor.church` instead of the actual runsheet repository, bypassing the existing read authorization path, allowing `matchRows` backfill metadata to become a write side effect, and letting synthetic target-only rows leak into source save/dirty state.