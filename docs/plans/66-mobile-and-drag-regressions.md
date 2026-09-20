# Plan v3 — runsheet regression + mobile UX pass

run_id: 13c0095a-dc64-4d69-a2e8-00f18f2d4b61 · family_id: c0127b9c-bdc2-4c06-b1dd-dc8a91c3b72e
issue: favorchurch/runsheet.favor.church#66 · base_sha: 3db15685883e9f672fba2d4b93b7a6e483ba7acf
playbook: Change · gear: direct · size_class: M
plan_version: 3 (v1 and v2 each exited on an accepted PLAN DEFECT from the
  independent reviewer codex/gpt-5.6-luna@xhigh; retained at plan.v1.md and
  plan.v2.md. No packets were emitted under either, so none to invalidate.)

## Contradicted assumptions from v1 (all reviewer-cited, all re-verified by me)
A1 v1 assumed the `moveItemById` off-by-one was the WHOLE cause of "drag handle isn't
   working". Contradicted: `handleDragStart` (:1096-1103) never calls
   `dataTransfer.setData()` nor sets `effectAllowed`, while the working column path does
   (:308-312). A directional off-by-one also does not match "isn't working anymore".
   Root cause is UNPROVEN until observed in a browser.
A2 v1 assumed a reorder test would pin the behaviour. Contradicted: the only existing
   downward-move test (dirty.test.tsx:289-322) drives the Card-view swap path, not table
   drag. The table drag test (:218-254) only drags UPWARD. 30/30 pass today with the bug
   present — a test written carelessly passes vacuously.
A3 v1 declared `pnpm lint` a validation gate. Contradicted: package.json:19 is
   `next lint --fix && tsc --noEmit`. It MUTATES files, so it cannot be a check gate.
A4 v1 computed the diff min-width as 100px per dynamic column. Contradicted:
   RunsheetTableEditor.tsx:1931-1935 gives Description / Notes / Main Instrument 150px,
   100px only as the fallback. N must also mean VISIBLE columns after
   `visibleColumns()` filtering (RunsheetTableEditorDiff.tsx:26-32).
A5 v1 treated T2 as a pure deletion. Contradicted: the span is the left child of a
   `justify-between` footer (RunsheetLandingView.tsx:129-146); deleting it slides "Open"
   to the left edge whenever itemCount is undefined.
A6 v1 understated T1's blast radius. Confirmed real: reorder marks rows changed
   (:1254-1256), save ships them (:1421-1431), and rockBulkSaveRunsheetItems.ts:253-255
   PATCHes Rock's `Order` field. Browser verification must not save to a live runsheet.

## Frozen intent (unchanged from v1 — the defect was in method, not intent)
goal / blast_radius / named_actions / non_goals: as v1.
Added non-goal: no live-runsheet save during browser verification.

## Tasks
T0 (blocking) Prove which browser event actually fails, before fixing anything.
   Run `pnpm dev`, open an EXISTING PERSISTED runsheet in edit mode, Table view, and
   attempt a handle drag with listeners logging each event. Record, per event, not per
   guess:
     - does `dragstart` fire on the handle cell at all?
     - if it fires, what are `dataTransfer.types` and `effectAllowed` immediately after
       `handleDragStart` returns?
     - does `dragover` fire on the target row, and is its default prevented?
     - does `drop` fire on the target row, and what is `dropEffect`?
   Then classify: (a) dragstart never fires — the drag never initiates, and the absent
   payload is a consequence, not the cause, since it is only ever set inside dragstart;
   (b) dragstart fires but dragover/drop never do — the drag initiates and is refused,
   which IS where an empty dataTransfer is a plausible cause; (c) the full sequence fires
   and upward works while downward is a no-op — the splice bug; (d) a combination.
   T1 is written against the recorded answer, not ahead of it.
   Depends on: none · Touches: nothing (observation only)

T1 Fix row reordering, per T0's finding.
   File: RunsheetTableEditor.tsx
   T1a if T0 finds (b) or (d): seed `dataTransfer` in `handleDragStart` —
       `setData('text/plain', …)` and `effectAllowed='move'` — matching the working
       column path at :308-312. If T0 finds (a), the cause is upstream of the payload;
       diagnose what blocks initiation and fix that instead.
   T1b if T0 finds (c) or (d): in `moveItemById` (:1111-1122), when the target's ORIGINAL index is
       after the dragged row's original index, insert at toIndex+1 so the row lands AFTER
       the target. Do NOT reroute `handleMoveCard` through the helper; its direct swap is
       deliberate and its comment documents why.
   Depends on: T0 · Touches: RunsheetTableEditor.tsx

T2 Remove "Instant load" AND keep the footer balanced.
   File: RunsheetLandingView.tsx:129-146. Remove the span and its HiSparkles icon, and
   switch the footer to `justify-end` when itemCount is undefined (or keep an
   aria-hidden spacer). Test the undefined-count branch.
   Depends on: none · Touches: RunsheetLandingView.tsx

T3 Inline diff table scrolls instead of compressing at phone width.
   File: RunsheetTableEditorDiff.tsx:71-78
   Give the table an explicit min-width so the existing `overflow-x-auto` engages.
   Width contract, stated explicitly rather than assumed: 88 (Start) + 78 (Duration)
   + 140 (Activity Title) + the sum over VISIBLE dynamic columns (post-`visibleColumns()`)
   of 150px for Description / Notes / Main Instrument and 100px otherwise — mirroring
   `getColumnStyle` at RunsheetTableEditor.tsx:1905-1935 so the diff and the editor agree.
   Reviewer confirmed `min-w-0` is already present on both wrapper roots (:66, :147), so
   no flex-chain fix is needed.
   Depends on: none · Touches: RunsheetTableEditorDiff.tsx

T4 Mobile UX pass. Enumerated targets, not a blanket rule:
   - card/table toggle, RunsheetTableEditor.tsx:2446-2467 (~22px)
   - Card-view move up/down buttons, RunsheetTableEditor.tsx:2804-2821 (~22px)
   - roster edit pencil, EventTeamRosterCard.tsx:238-248 (~22px)
   - diff −/Diff/+ group, RunsheetTableEditorDiff.tsx:151-153 (h-7/min-w-8). These sit in
     the diff TOOLBAR (`flex flex-wrap`, :147), not in the table header, so raising them
     cannot fight T3's table width — the earlier "raise only if it doesn't conflict"
     hedge was wrong and is withdrawn. They are raised to >=44px unconditionally like the
     rest; if the toolbar then exceeds 375px it wraps, which is what `flex-wrap` is for.
   Raise each to >=44px on touch widths with >=8px gaps, add explicit `focus-visible`
   rings to every control whose padding changes, and re-check the schedule header at
   375px for overflow introduced by the larger controls.
   Depends on: T1,T2,T3 · Touches: all of the above

## Waves
W1 = {T0} · W2 = {T1, T2, T3} (reviewer verified file-disjoint) · W3 = {T4}

## Done-criteria (falsifiable, per reviewer finding 8)
D1 Jest: table drag UP, table drag ADJACENT DOWN, table drag NON-ADJACENT DOWN, each
   driving the real dragStart/dragOver/drop sequence, each asserting BOTH the rendered
   row order AND the `order` values in the rockBulkSaveRunsheetItems payload.
   Anti-vacuity: each new test must FAIL against current HEAD before T1 lands, AND the
   recorded pre-T1 failure must be specifically a row-order or payload-order MISMATCH —
   not a thrown exception, not a missing element, not an unset `saveFn`. Record the
   actual assertion diff from the failing run. Each test asserts its preconditions first
   (handles found, row count, `saveFn` defined, dataTransfer populated) so a malformed
   test double fails loudly at setup instead of masquerading as the bug. Note that the
   existing test at dirty.test.tsx:244-245 fires dragStart/drop with no dragOver and no
   dataTransfer — do not copy that shape.
D2 At 375px the diff wrapper satisfies `scrollWidth > clientWidth`, and every column's
   measured width equals its T3 contract width (no column below it).
D3 At 375px `document.documentElement.scrollWidth === clientWidth` (no page-level
   x-scroll), and each control named in T4 measures >=44x44 via getBoundingClientRect.
D4 `git grep -ni "instant load" -- src` returns nothing, and the landing footer renders
   "Open" right-aligned when itemCount is undefined.
D5 `pnpm exec next lint` (NO --fix) and `pnpm typecheck` pass; `pnpm test` passes;
   `pnpm build` passes. `pnpm lint` is NOT a gate — it mutates (package.json:19).
D6 Browser evidence from `pnpm dev` against .env.local: edit mode at 1440px (drag both
   directions), diff mode at 375px, landing at 375px. Screenshots retained under
   <state_dir>/tmp/evidence/. NO SAVE is performed against a live runsheet — reorder is
   verified in the DOM and in the unit-test payload, never by PATCHing Rock's Order field.
   Precondition making that achievable (reviewer-verified): `handleDrop` mutates local
   state only (:1125-1139) and Rock is reached only from `handleSave` (:1421-1431) behind
   the Save button (:2099-2106) — so a drag alone writes nothing, PROVIDED verification
   uses an EXISTING PERSISTED runsheet in TABLE view. Two auto-save paths must be avoided:
   template initialization auto-saves on mount (:1633-1637, fires whenever `initialTemplate`
   is set) and Card-view editing auto-saves (:1640-1672). Do not open a template, and do
   not use Card view, during browser verification.

## model_assignments
orchestrator / planner: claude-opus-5[1m] · opus · high · claude-code CLI · inline.
executor: orchestrator, inline in a dedicated worktree. `route` → `no_qualifying_candidate`
  (cold-start catalog: identity-only rows, no capability data). Fail-soft, disclosed.
plan_reviewer: codex · gpt-5.6-luna · xhigh · DISPATCHED, returned PLAN DEFECT. Pane w4D:p3.
code_reviewer: independent, Herdr. Forced by `independent_code_review: risk_forced` (A6).
browser_verifier: independent, Herdr. Forced by `funded_browser_verification: acceptance_forced`.

## Protected paths
src/lib/runsheetInlineDiff.ts (layout only — reviewer confirmed realistic) ·
src/server-actions/** · .env.* (read only)
