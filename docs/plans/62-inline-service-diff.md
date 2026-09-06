# Inline Per-Cell Service Diff — Implementation Plan

## Source
- Issue: https://github.com/favorchurch/runsheet.favor.church/issues/62
- Repository/ref inspected: `favorchurch/runsheet.favor.church` @ `main` (`e9093be0ebc5e5834c737eb9f264d7b38664208f`)

## Goal
Add a read-only inline Diff mode to the currently open runsheet so a user can select one same-campus, same-date sibling service and see Git-style per-cell additions/removals directly inside the existing table without leaving the active sheet.

## Scope
### In scope
- Add a compact `− Diff +` selector/control on the open runsheet.
- Allow one sibling service to be selected as the comparison target.
- Load the comparison service without navigation.
- Diff the active table cell-by-cell, including computed start time and duration values.
- Render replacements as muted parenthesized source text plus yellow-highlighted comparison text.
- Render pure removals as muted parenthesized source text only.
- Render pure additions as yellow-highlighted comparison text only.
- Leave identical cells visually unchanged.
- Surface unmatched rows explicitly without positional guessing.
- Keep diff mode read-only with respect to the comparison service and free of Rock writes.
- Preserve existing full-screen Compare behavior.
- Keep mobile usable by stacking diff content inside existing cells rather than adding another service column.
- Add unit/component regression coverage.
- Bump the package version according to repository SemVer instructions when the feature implementation lands.

### Out of scope
- Replacing the existing `RunsheetCompareView`.
- Multi-service inline diff; inline mode compares exactly one active/source service against one target service.
- Pushing or merging target-cell values into the source sheet from Diff mode.
- New Rock schema fields, migrations, or persistence for Diff UI state.
- Changing sibling resolution beyond the existing same-campus/same-date rules.

## Repository evidence
| Path / symbol | Current responsibility / observed behavior | Why it matters |
| --- | --- | --- |
| `src/components/runsheet/RunsheetManager.tsx` | Owns active channel selection, channel list, React Query access scope, editor mode, and the existing full-screen Compare entry point. | Best orchestration point for passing sibling candidates and cached/fetched target details into the active editor without navigation. |
| `src/components/runsheet/RunsheetTableEditor.tsx` | Renders the active spreadsheet-style grid, computes displayed start/duration values, owns read/edit state, and already imports sibling/match/batch-read helpers for propagation. | Inline Diff must decorate this existing rendering path so layout, column widths, card/mobile behavior, and current edit/save logic remain intact. |
| `src/components/runsheet/RunsheetCompareView.tsx` | Existing 2–4 service comparison surface; batch-loads details, computes per-service timing, compares cell values, sanitizes rich text, and supports separate matrix editing when allowed. | Provides established comparison and rendering behavior to reuse conceptually, while issue #62 explicitly requires a lighter inline read-only presentation rather than another side-by-side grid. |
| `src/lib/runsheetSiblings.ts` / `resolveSiblings` | Resolves same-campus, same-date runsheets excluding the active channel. | Directly satisfies target-service eligibility and avoids inventing another matching rule. |
| `src/lib/runsheetMatch.ts` / `matchRows` | Pairs rows by `SIBLINGKEY` first and unique title second; unmatched rows remain unmatched. | Required by acceptance criteria to avoid row-index alignment and false comparisons. |
| `src/server-actions/rockGetRunsheetDetailsBatch.ts` | Existing batch read path for loading multiple runsheets. | Can load the chosen sibling through the existing authorized read boundary with no new write action. |
| `src/components/runsheet/runsheetQueries.ts` | Defines scoped React Query cache keys and detail reads keyed by access scope and channel id. | The target detail should preferably reuse manager/query-cache data where practical instead of creating an unrelated cache path. |
| `src/lib/richText.ts`, `src/lib/sanitizeRichText.ts`, `RichTextContent` | Existing safe rich-text normalization/rendering path. | Diff values must not bypass the existing sanitization model when showing source and target content. |
| `tests/unit/components/RunsheetManager.compare.test.tsx`, `tests/unit/components/RunsheetTableEditor.*.test.tsx`, `tests/unit/lib/runsheetMatch.test.ts` | Existing component and matching coverage near the affected feature. | These are the nearest regression-test homes for selector wiring, in-table rendering, unmatched-row behavior, and no-write guarantees. |
| `AGENTS.md` and `package.json` | Repository instruction requires SemVer updates; current package version is `1.13.2`. | Feature implementation should include the appropriate minor version bump when production code is added. |

## Current state
The app already has two related mechanisms:

1. `RunsheetManager` exposes a full-screen **Compare** action that opens `RunsheetCompareView` and selects 2–4 runsheets.
2. `RunsheetTableEditor` already uses `resolveSiblings`, `matchRows`, and batch detail loading for propagation review after saves.

The active grid remains a single-runsheet editor/viewer. Cell rendering is optimized around the current sheet, which is exactly the surface issue #62 wants to preserve. The existing full-screen compare view builds a second comparison-specific table and can become editable in edit mode, so it should not be repurposed directly for this feature.

## Target state
When a runsheet is open, the user sees a compact `− Diff +` control. Selecting a sibling service activates inline Diff mode. The active sheet remains structurally unchanged; each visible cell is rendered using a comparison state derived from the active row and its matched target row:

- same: normal current rendering, once;
- replaced: `(current)` muted, then target highlighted yellow;
- removed: `(current)` muted only;
- added: target highlighted yellow only;
- unmatched target/source row: explicit muted absence marker, never index-aligned.

The comparison target remains read-only, and entering/leaving Diff mode performs no writes.

## Implementation approach

### 1. Introduce a pure inline-diff model/helper
- Proposed new file: `src/lib/runsheetInlineDiff.ts`.
- Define a small pure representation such as:
  - `InlineDiffState = 'same' | 'replace' | 'remove' | 'add' | 'unmatched'`
  - source/display value, target/display value, and optional row-match metadata.
- Add helpers that compare normalized display values while preserving original rich-text values for rendering.
- Treat blank/empty-string versus non-empty values as add/remove rather than generic replace.
- Keep row correspondence outside positional indexes by consuming `matchRows` results.
- Include computed `START_TIME` and `DURATION` as synthetic comparable values so their comparison uses the exact derived display strings produced by the active table logic rather than raw Rock timestamps.
- Do not include any save/write logic in this module.

Focused validation:
- same value;
- replacement;
- source-only removal;
- target-only addition;
- blank-vs-blank same;
- unmatched row;
- rich-text values that are semantically equivalent after the same normalization used for current display.

### 2. Add one-target sibling selection state around the active editor
- Update `src/components/runsheet/RunsheetManager.tsx` to provide the active editor enough channel context to select a valid comparison target.
- Reuse `availableChannels` plus `resolveSiblings(selectedChannelId, runsheetData.name, availableChannels)` to restrict options to same-campus/same-date siblings.
- Keep selected target id in local UI state; reset it when the active source channel changes or the chosen sibling is no longer available.
- Prefer existing React Query detail data when already cached; otherwise load the target using the existing authorized detail/batch read path.
- Do not navigate the URL when target selection changes.
- Do not gate the Diff selector on `canEdit`; users who can view the active runsheet should be able to visually diff it.

Focused validation:
- only sibling services appear;
- active channel never appears as a target;
- source navigation clears stale diff selection;
- no extra route transition occurs.

### 3. Add the `− Diff +` UI and target label
- Update `RunsheetTableEditor.tsx` (or a small proposed `InlineDiffControl.tsx` if extraction keeps the editor manageable) to render the compact control near the existing active-runsheet toolbar/header controls.
- Visual contract:
  - red `−` affordance on the left;
  - centered `Diff` label / selected target time;
  - green `+` affordance on the right;
  - target picker opens from this control and lists sibling service labels/times.
- Define explicit behavior for the controls:
  - `+` opens/advances target selection or enables Diff when off;
  - `−` clears/disables the current Diff target (and may move to a previous sibling only if implementation makes that interaction unambiguous); the required behavior is that it is visibly red and provides the remove/disable side of the control.
- Show the chosen target clearly enough that users know which service is being compared, especially on mobile.
- Keep the existing `Compare` action unchanged.

Focused validation:
- accessible button names/labels;
- selector works with keyboard/touch;
- compact layout does not overflow the mobile header.

### 4. Decorate existing table/card cell rendering instead of creating a second grid
- Extend the current rendering path in `RunsheetTableEditor.tsx` so each visible row has access to its matched target row.
- Build one match result when the target sheet loads using `matchRows(processed/current source rows, targetChannelId, target.items)`.
- Create lookup maps keyed by stable source row id for O(1) render access rather than repeatedly scanning/matching per cell.
- For dynamic attribute cells:
  - obtain source value through the same current cell-value accessor used by the editor;
  - obtain target value from the matched row's corresponding attribute;
  - render via the inline-diff helper.
- For rich-text cells, preserve the existing sanitization/`RichTextContent` safety path for both source and target fragments.
- For person/platform cells already present in the table, diff their displayed strings visually; do not hide them just because full-screen Compare hides them by default.
- For title/music cells, retain existing song/title UI semantics and only layer visual diff presentation when not actively editing that cell.
- For computed start time/duration cells, compare the source table's already-derived display values against target-derived display values generated with the same timing helpers.
- If edit mode is active, the source remains editable. The target diff value must never become an input value, and opening an editor for a changed source cell should not mutate/consume the target value.

Focused validation:
- identical cells are pixel/DOM-equivalent to normal rendering apart from non-visible wrapper metadata;
- replacement/add/remove visual states match issue rules;
- target value is never editable;
- source save payload is unchanged by Diff mode.

### 5. Surface unmatched rows safely
- Use `matchRows` rather than row index.
- For a source row with no target match, render a compact muted marker such as `(not in 5:30 PM)` in a non-invasive position rather than synthesizing a target value.
- If target-only rows need to be represented, do not splice them into arbitrary source positions. In v1, surface a concise summary/marker (for example, a Diff status bar listing `N segment(s) only in target`) unless a stable insertion position can be derived from sibling lineage.
- Do not backfill `SIBLINGKEY` as a side effect of viewing Diff mode; `matchRows` can emit backfill suggestions, but inline Diff must ignore them because issue #62 requires no writes.

Focused validation:
- duplicate titles do not get guessed matches;
- unmatched source row displays explicit absence;
- target-only rows are reported without corrupting source table row order;
- no Rock write action is invoked.

### 6. Preserve existing full-screen Compare and save behavior
- Do not alter `RunsheetCompareView` semantics except possibly extracting a shared pure display-normalization helper if it reduces duplication without changing behavior.
- Keep `rockBulkSaveRunsheetItems`, propagation flows, dirty tracking, unsaved-navigation guards, and full-screen compare editing untouched by Diff mode.
- Ensure clearing Diff state does not mark the active editor dirty.
- Ensure target refresh/fetch failures surface a small non-blocking error and leave the source table usable.

### 7. Add tests and SemVer bump
- Proposed new unit test: `tests/unit/lib/runsheetInlineDiff.test.ts`.
- Extend `tests/unit/components/RunsheetManager.compare.test.tsx` or add a focused `RunsheetManager.diff.test.tsx` for sibling selection/orchestration.
- Extend `tests/unit/components/RunsheetTableEditor.layout.test.tsx` or add `RunsheetTableEditor.diff.test.tsx` for per-cell DOM rendering and mobile-safe stacking.
- Reuse/extend `tests/unit/lib/runsheetMatch.test.ts` for ambiguity/unmatched cases only if new behavior requires additional match assertions.
- Mock/spy write actions to prove entering Diff mode and switching targets do not call `rockBulkSaveRunsheetItems` or propagation executors.
- Update `package.json` version from `1.13.2` to the appropriate minor feature version (expected `1.14.0` unless intervening mainline releases change the base version) per `AGENTS.md`.

## Data / migration considerations
No Rock schema change, migration, or backfill is needed. Inline Diff reads existing channel/item data only. Existing `SIBLINGKEY` values are used when available; title fallback is read-only. Any `matchRows` backfill suggestions must be ignored in this surface.

## Security / permissions
- Reuse the existing authorized runsheet channel list and detail read server actions.
- Do not broaden channel access: a user may only select a target already present in their authorized `availableChannels` set.
- Diff mode must not introduce a write path.
- React Query keys must remain scoped by the existing access-scope discriminator so one principal's cached target data cannot leak into another principal's session.

## Validation
Automated:
- `pnpm test -- tests/unit/lib/runsheetInlineDiff.test.ts`
- `pnpm test -- tests/unit/components/RunsheetManager.diff.test.tsx`
- `pnpm test -- tests/unit/components/RunsheetTableEditor.diff.test.tsx`
- relevant existing regression suites:
  - `tests/unit/components/RunsheetManager.compare.test.tsx`
  - `tests/unit/components/RunsheetTableEditor.layout.test.tsx`
  - `tests/unit/components/RunsheetTableEditor.dirty.test.tsx`
  - `tests/unit/lib/runsheetMatch.test.ts`
- `pnpm typecheck`
- `pnpm build`

Manual:
- Open a 3:00 PM service and diff against 5:30 PM on desktop and mobile.
- Confirm unchanged `Runsheet Huddle`-style cells remain visually normal.
- Confirm changed text renders source muted in parentheses and target yellow.
- Confirm pure blank/nonblank add/remove cases.
- Confirm a missing segment is explicit and does not shift other rows.
- Toggle Diff while in view mode with a non-editor account.
- Toggle Diff on/off while in edit mode and verify dirty state is unchanged until the source itself is edited.
- Save a source edit while Diff is active and verify only source changes are sent to Rock.
- Open full-screen Compare afterward and verify it behaves exactly as before.

Commands above are repository-declared but were not executed during planning because this workflow used GitHub API inspection rather than a local checkout.

## Acceptance criteria mapping
- [ ] Choose one sibling through `− Diff +` -> manager/editor selector component test plus manual mobile check.
- [ ] Target loads without navigation -> manager diff test asserts no route change and target read occurs.
- [ ] Identical cells unchanged -> inline diff unit + editor DOM regression test.
- [ ] Replacement rendering -> inline diff unit + editor DOM test.
- [ ] Removal rendering -> inline diff unit + editor DOM test.
- [ ] Addition rendering -> inline diff unit + editor DOM test.
- [ ] Row matching uses sibling key / unique title -> existing `matchRows` plus new integration assertion in editor diff test.
- [ ] Missing sibling rows explicit -> editor diff unmatched-row test.
- [ ] No Rock writes -> write-action spies remain untouched when entering/switching Diff.
- [ ] Existing edit/save and full-screen Compare preserved -> existing dirty/layout/compare suites plus manual smoke test.
- [ ] Mobile stacks diff within cells -> responsive DOM/class assertion plus device smoke test.

## Rollout / rollback
This is additive client/UI behavior over existing authorized reads. No feature flag is required unless the implementation reveals render-performance risk in the very large editor component. Rollback is a normal code revert; no data cleanup is required because Diff mode has no persistence.

## Risks and assumptions
- `RunsheetTableEditor.tsx` is already very large; extracting the selector and/or pure diff renderer into small components is preferred if it prevents further coupling.
- `matchRows` generates backfill suggestions during title fallback. Diff mode must consume only `matches`, never execute backfill writes.
- Target-only rows cannot be safely inserted into the source table by position when lineage is ambiguous. v1 should report them separately rather than guess.
- The current source sheet may contain unsaved edits while Diff is active. The intended behavior is to compare the current in-memory source value against the persisted target value, because the source is the user's active truth while editing.
- Package version `1.14.0` is only the expected bump from inspected `1.13.2`; implementation must re-read `package.json` before changing it in case main advances first.

## Review notes
Self-review found and corrected three material failure modes before commit: (1) target-only rows must not be index-inserted, (2) `matchRows` backfill output must be ignored to preserve no-write behavior, and (3) unsaved source values should remain the compared source state rather than forcing a persisted snapshot.

Adversarial fallback review (no separate subagent runtime available):
- CRITICAL: None after enforcing no backfill writes and authorized-target filtering.
- MAJOR: Avoid per-cell repeated row matching/scans in the 135k-line-character editor; build match/value lookup maps once per target load. Addressed above.
- MAJOR: Do not reuse editable `RunsheetCompareView` directly because it can save comparison edits and violates the requested inline/no-write interaction. Addressed by keeping it separate.
- MINOR: Make the selected target time visible in the compact control so users cannot forget what service they are diffing against. Addressed above.
