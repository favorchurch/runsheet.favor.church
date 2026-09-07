# Fix PR #64 code-review findings (inline service diff)

## Context

PR #64 (`issue/61-inline-service-diff`, tracking issue #61) adds an inline
per-cell service diff mode. A medium-effort `/code-review` pass on 2026-09-07
returned `CHANGES REQUIRED`: two correctness bugs and one non-running test
suite. This plan fixes exactly those three blocking findings on the same
branch/PR and lands it to `main` once a fresh review approves.

**Line-number correction:** the original review report cited line numbers
(404, 539, 234, 163) that do not match this file's actual line count (230
lines). The planner re-verified every finding directly against
`origin/issue/61-inline-service-diff` by grepping the named functions; the
**logic diagnosis in each finding is confirmed correct**, only the line
numbers were off (likely a diff-hunk numbering artifact from the review
tool). Corrected locations are used below — use these, not the ones in any
older review comment.

## Global Constraints

- **Repo:** `favorchurch/runsheet.favor.church`. **Branch:** existing
  `issue/61-inline-service-diff` (do not create a new branch or new PR — PR
  #64 already exists as a draft against this branch).
- **Environment target:** `main` is connected to Vercel
  (`favor-church/runsheet.favor.church`) and auto-deploys to
  `runsheet.favor.church` (production) on every push/merge — confirmed via
  `gh api repos/.../commits/<sha>/status` showing a completed Vercel
  deployment status on the last `main` merge commit. **Merging PR #64 is a
  production deploy.**
- **Do not touch:** anything outside the 2 files below plus their direct test
  files. No refactor of the non-blocking findings (duplicate export name,
  missing dynamic-column merge, duplicated timing logic, redundant
  normalization, O(n²) complexity) — those are explicitly out of scope.
- **Validation commands (must all pass before requesting review):**
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- **Package manager:** `pnpm` only (per repo convention).
- **Bootstrap adaptation:** normally the executor's first act is a plan-only
  commit + push + a brand-new draft PR. Here PR #64 already exists and is
  already a draft, so instead: commit this plan file alone as the first
  commit on `issue/61-inline-service-diff`, push it, and post the run's
  bootstrap comment on **existing PR #64** (never open a second PR). The two
  allowed executor-event comments (bootstrap, completion) both go on PR #64.
- **Tracking issue:** already exists (#61, referenced by the branch name and
  PR #64's body) — do not file a new one.

## Numbered tasks

### Task 1 — Fix target-only row insertion sentinel bug

- **File:** `src/lib/runsheetInlineDiff.ts`, function `buildInlineDiffRows`,
  the target-only insertion loop at **lines 186-211** (corrected from the
  review's cited line 539).
- **Bug:** `insertionIndex === result.length` (line 203) is used to mean "the
  backward search (lines 189-201) found no matched neighbor," but it is also
  true when the backward search legitimately lands at the end of `result`.
  When that happens, the forward-search fallback (lines 204-210) wrongly
  overrides a correct backward-search result.
- **Reproduction (confirmed real):** `source=[A,B,C]`, `target=[A,C,X,B]` (X
  new, B reordered after C) → expected order `[A,C,X,B]`, actual output
  `[A,X,B,C]`.
- **Fix:** introduce an explicit boolean (e.g. `foundBackward`) set inside the
  backward-search loop only when a matched neighbor is actually found, and
  gate the forward-search fallback on `!foundBackward` instead of on
  `insertionIndex === result.length`.
- **Verification (plan-review F4 — test the property, not one instance):**
  add two regression unit tests: (a) the reorder case above, asserting order
  `[A,C,X,B]`; (b) a target-only row whose nearest matched neighbor is
  legitimately the **last** row in `result` (the case the old sentinel
  conflated with "not found") — e.g. `source=[A,B]`, `target=[A,B,Y]` must
  produce `[A,B,Y]`, not have Y's placement overridden by the forward-search
  fallback. Run `pnpm test -- runsheetInlineDiff`.
- **Strategy tag:** targeted logic fix + regression test.

### Task 2 — Fix sub-item Start time in `buildTimingMap`

- **File:** `src/lib/runsheetInlineDiff.ts`, function `buildTimingMap`,
  **lines 51-65** (corrected from the review's cited line 404).
- **Bug:** every visible row (including zero-duration sub-item/note rows) is
  assigned `start: currentMinutes` **before** advancing the clock by that
  row's own duration — but a zero-duration row that immediately follows a
  timed segment should inherit that segment's start, matching how
  `RunsheetTableEditor.tsx` (lines 828-895, the base, non-diff editor)
  actually displays sub-item Start times. Currently: a 30-min "Worship Set"
  starting 3:00 PM followed by a zero-duration note row shows the note's
  Start as 3:30 PM in the diff table (wrong) vs. 3:00 PM in the real editor
  (correct).
- **Fix (plan-review F3 — exact rule, both branches, confirmed by reading
  `RunsheetTableEditor.tsx` lines 828-895 directly):**
  1. **Non-leading zero-duration rows** (immediately following a
     duration > 0 row): inherit that segment's own `start` **and** `end`
     (the segment's post-increment clock value) — not the clock value at the
     point the sub-item itself is visited. (`RunsheetTableEditor.tsx`
     lines 857-868.)
  2. **Leading zero-duration rows** (no preceding segment in this block —
     i.e. the row at the very start of a run of duration-0 rows with no
     prior duration > 0 row): `start` = `end` = the current clock value,
     unadvanced. (`RunsheetTableEditor.tsx` lines 871-890.)
  `buildTimingMap` must track both a `start` and an `end` per row (it
  currently only tracks `start` and empty-string `duration`) so the same
  segment-vs-leading distinction the base editor makes is available to the
  diff table.
- **Verification:** add regression unit tests for **both** branches: (a) a
  30-min segment starting at a fixed time followed by a zero-duration row —
  the zero-duration row's Start must equal the segment's Start (not the
  post-increment clock); (b) a zero-duration row with no preceding segment —
  its Start must equal the unadvanced clock value at that point. Run
  `pnpm test -- runsheetInlineDiff`.
- **Strategy tag:** targeted logic fix + regression test, cross-checked
  against `RunsheetTableEditor.tsx`'s existing (correct) behavior.

### Task 3 — Fix the diff test suite's missing auth mock

- **File:** `tests/unit/components/RunsheetTableEditor.diff.test.tsx`
  (whole-file issue, not a single line — the review's cited line 7 pointed at
  an import, not the missing mock).
- **Bug:** the suite mocks server actions and sibling components but never
  mocks `@auth0/nextjs-auth0` / `@/auth0-hooks/server/getRockSession` the way
  every sibling test file does (e.g.
  `tests/unit/components/RunsheetCompareView.test.tsx` lines 22-28).
  Automocking pulls in the real auth0→jose ESM chain and the whole suite
  throws `SyntaxError: Unexpected token 'export'` before a single assertion
  runs.
- **Fix (plan-review F2 — the file's existing mocks cover none of these 5;
  add all 5, not a subset):** add, near the top of the file alongside the
  existing `jest.mock(...)` calls, all five mocks from
  `RunsheetCompareView.test.tsx` lines 21-28 verbatim:
  ```ts
  jest.mock('@auth0/nextjs-auth0', () => ({
    getSession: jest.fn().mockResolvedValue(null),
  }));
  jest.mock('@/server-actions/internal/rockFetch');
  jest.mock('@/auth0-hooks/server/assertAuthenticated');
  jest.mock('@/auth0-hooks/server/getServerSession');
  jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
  ```
  `rockFetch` is a plausible entry point into the auth0→jose chain; a partial
  copy (e.g. only 3 of the 5) may still crash. Copy all 5.
- **Verification:** `pnpm test -- RunsheetTableEditor.diff.test.tsx` must
  exit 0 with more than 0 tests run (currently: crashes before any test
  runs).
- **Strategy tag:** mechanical fix, copy an existing working pattern.

## Dependency graph

All three tasks touch different functions/files with no shared state.
Single wave, any order, all inline in one executor:

```
Wave 1 (parallel-safe, single executor, sequential in practice):
  T1 (runsheetInlineDiff.ts insertion bug)   Depends on: none · Touches: src/lib/runsheetInlineDiff.ts
  T2 (runsheetInlineDiff.ts timing bug)      Depends on: none · Touches: src/lib/runsheetInlineDiff.ts
  T3 (diff test suite auth mock)             Depends on: none · Touches: tests/unit/components/RunsheetTableEditor.diff.test.tsx
```

T1 and T2 touch the same file (no overlapping lines) — one executor, applied
serially, is correct; do not split across two writers.

## Out of scope

- The 5 non-blocking findings from the 2026-09-07 review (duplicate
  `RunsheetTableEditor` export name between `RunsheetTableEditorDiff.tsx` and
  the base editor; `RunsheetTableEditorDiff.tsx` deriving columns only from
  `source.columns`; duplicated timing logic vs.
  `RunsheetCompareView.tsx`'s `sheetTimingMap`; redundant double
  normalization in `classifyInlineDiffCell`; O(n²) insertion logic). None of
  these block merge; do not fix them in this run.
- **(plan-review F5)** `RunsheetCompareView.tsx:382`'s `sheetTimingMap`
  duplicates the timing logic this plan fixes in `buildTimingMap`. Leaving it
  untouched is a deliberate, acknowledged tradeoff: after this run, the
  inline diff view and the compare view can report different sub-item Start
  times until `sheetTimingMap` gets the same fix. File a follow-up comment on
  issue #61 noting this divergence; do not pull `sheetTimingMap` into this
  run's scope.
- Any change to `main` other than merging this PR (the named `git revert`
  path below is the sole exception, held for rollback only).
- Any change to Rock, Vercel, or other Favor systems.

## Task assignment table

| Repo | Executor | Model+effort | Worktree | Scope |
|---|---|---|---|---|
| `runsheet.favor.church` | codex | `gpt-5.6-luna` `high` | `../wt-fix-pr64-review` @ `origin/issue/61-inline-service-diff` | Tasks 1-3, end to end |

| # | Task | Worker brand | Model+effort | Dispatch | Diagnosis | Why this dispatch form |
|---|---|---|---|---|---|---|
| 1 | Fix insertion sentinel bug + regression test | — | executor itself | inline | settled (reproduced above, real code read directly) | Single function, one file already loaded by the executor; a brief would cost more than the edit |
| 2 | Fix sub-item timing bug + regression test | — | executor itself | inline | settled (reproduced above, real code read directly) | Same file as T1, same reasoning |
| 3 | Add missing auth mock to test file | — | executor itself | inline | settled (exact working pattern identified in a sibling file) | Mechanical, pattern already located |

### Fan-out tree

```
PLANNER (claude opus, this session)
  │
  ├─▶ EXECUTOR  codex gpt-5.6-luna high  ·  ../wt-fix-pr64-review  ·  tasks 1-3 end to end
  │     ├─ T1 ─── inline (insertion bug + test)
  │     ├─ T2 ─── inline (timing bug + test)
  │     └─ T3 ─── inline (test mock fix)
  │
  └─▶ CODE REVIEWER  codex gpt-5.6-luna xhigh  (fresh)  ← planner-dispatched, gates the whole diff
        (caller override, Rico: "use codex reviewers instead of opus" — priced at xhigh, not the
        high floor, because this leg is production-facing per Reviewer Selection's row 1)
```

No scouts needed for Phase 1 recon — all three locations were already found,
read, and verified directly against the real file by the planner (see
"Line-number correction" above), so a scouting pass would just re-confirm
work already done and verified this turn.

**Plan-review note on the executor model tag (F6, partially rejected):** a
fresh reviewer flagged `gpt-5.6-luna` as not looking like a public codex
model id. Verified directly against this machine's `~/.codex/config.toml`:
`model = "gpt-5.6-luna"` is this environment's actual configured default and
matches the office's own standing routing default (auto-routing.md, "set
2026-08-26") — kept as-is. The reviewer's second point (no reviewer row in
the per-task table) is also not applied: per this office's own convention
the code reviewer is a planner-dispatched gate shown in the fan-out tree,
never a row in the executor's per-task table (it does no task-table work).

## GOAL block

```yaml
goal: Fix PR #64's three blocking review findings on its existing branch and merge it to main.
done_criteria:
  - id: dc1
    statement: "(plan-review F4 — property, not one instance) Every target-only row lands adjacent to its nearest matched target neighbor, including when that neighbor is the last row in `result` — the backward-search-hit-the-end case must never be treated as backward-search-failed."
    verify: Two new unit tests both green under `pnpm test -- runsheetInlineDiff`: (a) source=[A,B,C], target=[A,C,X,B] produces exact order [A,C,X,B]; (b) source=[A,B], target=[A,B,Y] produces exact order [A,B,Y].
  - id: dc2
    statement: A zero-duration row's Start (and End) in the diff table match RunsheetTableEditor.tsx's rule exactly — inherited from the preceding timed segment when one exists, or the unadvanced clock when the row is leading with no preceding segment.
    verify: Two new unit tests both green under `pnpm test -- runsheetInlineDiff`, one per branch (non-leading zero-duration row inherits segment Start/End; leading zero-duration row gets Start=End=unadvanced clock).
  - id: dc3
    statement: RunsheetTableEditor.diff.test.tsx loads and executes without the auth0/jose ESM crash.
    verify: "`pnpm test -- RunsheetTableEditor.diff.test.tsx` exits 0 with tests_run > 0."
  - id: dc4
    statement: Full validation suite passes with the fixes applied.
    verify: "`pnpm lint`, `pnpm test`, `pnpm build` all exit 0."
  - id: dc5
    statement: A fresh independent code review of the updated diff returns the literal verdict APPROVED, not CHANGES REQUIRED.
    verify: "(plan-review F7 — concrete artifact, not prose) The fresh codex-luna xhigh reviewer's full response is quoted verbatim by the planner in the PR #64 completion comment and in this run's closeout; the planner reads that quoted text for the literal string APPROVED before invoking the merge named_action. `gh pr view 64 --json reviewDecision` is NOT the check — this reviewer is an agent, not a GitHub PR reviewer, so that field stays empty. (Caller override, Rico, live during this run: codex reviewer instead of the opus-low default; priced at xhigh per Reviewer Selection row 1 since this leg is production-facing.)"
  - id: dc6
    statement: PR #64 is marked ready for review and merged into main.
    verify: "`gh pr view 64 --json state,mergedAt,isDraft` shows isDraft:false and state:MERGED with a non-null mergedAt."
milestones:
  - id: m1
    criteria: [dc1, dc2, dc3, dc4]
    lands_on: issue/61-inline-service-diff   # pushed to existing PR #64, not main
  - id: m2
    criteria: [dc5]
    lands_on: issue/61-inline-service-diff   # review verdict recorded, no code change
  - id: m3
    criteria: [dc6]
    lands_on: main
named_actions:
  - action: "gh pr ready 64"
    target: favorchurch/runsheet.favor.church PR #64
    changes: "(plan-review F1) Marks the still-draft PR #64 ready for review — required before merge is even possible; `gh pr merge` hard-fails on a draft and the mergeable/mergeStateStatus dry_run below does not surface this."
    dry_run: "gh pr view 64 --json isDraft — confirm true before, false after"
    revert: "gh pr ready --undo 64 (returns PR to draft; no production effect since nothing has merged yet)"
    read_back: "gh pr view 64 --json isDraft shows false"
  - action: "gh pr merge 64 --merge"
    target: favorchurch/runsheet.favor.church PR #64 (issue/61-inline-service-diff -> main)
    changes: Merges the fix commits into main as a merge commit (matches this repo's existing convention — no squash, branch not deleted), triggering a Vercel production deploy of runsheet.favor.church.
    dry_run: "gh pr view 64 --json mergeable,mergeStateStatus,isDraft — isDraft must be false (see the gh pr ready action above) or this action is not yet safe to run"
    revert: "git revert -m 1 <merge-commit-sha> on main, then push — sha captured from `gh pr view 64 --json mergeCommit` immediately after merge. This is the one named exception to the 'no other change to main' non-goal."
    read_back: "gh pr view 64 --json state,mergedAt,mergeCommit; gh api repos/favorchurch/runsheet.favor.church/commits/<merge-sha>/status to confirm the Vercel deploy completes; if a revert was performed, re-run the same status check against the revert commit to confirm that deploy also completes. (plan-review note: a green deploy status confirms the build shipped, not that the diff view renders correctly for real data — the planner will additionally open runsheet.favor.church's inline diff view for one live service comparison and confirm no console errors and correct row ordering before treating m3 as fully closed.)"
non_goals:
  - Fixing any of the 5 non-blocking findings from the 2026-09-07 review.
  - Any change to files other than the 2 named above (plus their new regression tests).
  - Squashing or deleting the branch on merge (repo convention keeps both).
  - Pulling RunsheetCompareView.tsx's sheetTimingMap into this fix (see Out of scope).
blast_radius:
  repos: [favorchurch/runsheet.favor.church]
  environments: [production — main auto-deploys to runsheet.favor.church via Vercel]
caps:
  review_rounds_per_task: 5
  agy_consecutive_tasks: 3
  loop_iterations: 5
```
