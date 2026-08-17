# Run report — runsheet access tightening

**Dates:** 2026-08-16 → 2026-08-17 · **Gear:** full · **Final state:** `main` @ `a0347e0`

## Goal

Tighten access on `runsheet.favor.church` per `rock-security/SECURITY-POLICY.md`: staff get
edit and create, ministry-team volunteers get view-only, administrators get full access,
everyone else is denied.

| Done-criterion | Final verify output |
|---|---|
| Access model matches the role taxonomy | `resolveRunsheetAccessPolicy` is the single grant source; live audit resolves 1,494 principals through it — 112 editors, 1,376 view-only, 6 denied |
| Every runsheet server action enforces it | `assertRunsheetEditAccess` / `assertRunsheetViewAccess` choke point; mutation probes kill each guard |
| View/Edit toggle in the app, defaulting to View | Shipped in `5cbc3bf`, default View for everyone including editors (D1) |
| Rock role audit, read-only | `pnpm audit:access`, two prod passes, `docs/runsheet-access-audit.md` |
| Gates | 27 suites / 174 tests, lint 0 errors, `pnpm build` green — re-run on the merged tree at `a0347e0` |

**Governing decision (D4, Rico 2026-08-16):** *"The person's access-level shouldn't limit what
the runsheet app is able to do."* Authorization gates the **user's actions**, never the app's
service-key data reads. A viewer may see the whole runsheet including names they could not see
in Rock directly; a viewer may not edit, assign, create, duplicate, delete, or bulk-save.
**Over-tightening a read was treated as a defect equal in severity to leaving a write ungated**,
and one such over-tightening was caught and reverted (M2 B3).

## Landed

| Milestone | PR | Into | Range |
|---|---|---|---|
| M1 access model | #13 | `staging` → `main` | `1d3daa0..09048ee` |
| M2 server-action enforcement, M3 View/Edit toggle | #14 | `staging` → `main` | `..949807a` |
| M4 audit tooling (OData chunking) | #16 | `staging` | `89dec68..da624cb` |
| M4 audit hardening + live report | #17 | `staging` | `ac3d9d7..f07c3b7` → `74b0819` |
| Production promotion | #20 | `main` | `949807a..a0347e0` |

## Route

One executor per repo, one repo. `gpt-5.6-luna` (codex, sonnet-tier `xhigh`) for M1–M4 — backend
authorization and data work, its preferred lane. A Claude sonnet executor for the final #17
remediation rounds after the codex executor was killed by the environment five consecutive times
without producing work. Reviewers: fresh Opus every round, resumed across rounds of the same task.
Gear was **full** from the fit test and never downgraded — production-facing and irreversible.

## Task ledger

| Task | Brand | Rounds | Verdict | Notes |
|---|---|---|---|---|
| M1 access model | codex luna | 3 | APPROVED | 3 blockers: unclamped TTL on the fetch that decides authz; a campus-root refactor that could lock everyone out; 2 grant rules surviving deletion with 103 tests green |
| M2 enforcement | codex luna | 3 | APPROVED | B1 cross-channel delete (any editor could delete arbitrary `ContentChannelItem` rows anywhere in Rock); B3 the B1 fix over-tightened and broke add-row-then-delete |
| M3 toggle | codex luna | 1 | APPROVED | — |
| M4 audit | codex luna | 4 | APPROVED | live audit initially failed on Rock's 100-node OData limit |
| #17 remediation | claude sonnet | 2 | APPROVED | R1 blocked on `isActiveMembership` having zero coverage; R2 approved and proved the new guard could be neutered by fixture edit alone |

## Stops

| Stop | Asked | Answered |
|---|---|---|
| Roster-filter escalation | Widening runsheet visibility to all campus viewers | Keep the widening for the proof-of-concept; file a follow-up (#10) |
| Production deploy | Originally scoped staging-only | Authorized, after verifying `IsArchived eq false` against prod Rock first |

## Not verified

- **`GLOBAL_EDIT_GROUP_IDS` membership is a snapshot, not a monitor.** Groups 4 and 5 are empty
  *today*; nothing alerts if someone is added, and the grant is unconditional and all-campus.
- **No browser-level authorization test.** The toggle and the server guards were verified by unit
  tests and mutation probes, not by driving the live app as a real view-only volunteer. No end-to-end
  proof that a viewer's UI cannot reach an edit path by some route the tests do not model.
- **`$top` truncation is undetected on every Rock read** (`/GroupMembers` 5000, `/Groups` 2000,
  `/GroupTypeRoles` 100). Live values are far below all three, so the figures are sound today, but a
  future over-limit read under-reports silently rather than erroring. Filed as #19.
- **The string-coercion branches of `isActiveMembership` are uncovered** — the fixture only exercises
  boolean/numeric forms. Filed as #18.
- **The old-model gain/loss delta and the §1.0–§1.3 staff/non-staff drift comparison were not
  produced.** There is no old-model baseline to diff against; generating either would have meant
  fabricating a comparison.
- **`~/Git/rock-security` was never modified** — verified at `ac5b33f`, clean. The §1.1 amendment
  ships as *proposed text only* inside `docs/runsheet-access-audit.md`; nobody has accepted it.

## Still open

- **#10** — campus viewers see all runsheets for their campus regardless of roster. Deliberate for
  the proof-of-concept (Rico, 2026-08-16); the audit measures the exposure at ~1,376 view-only people.
- **#15** — `/create` returns 500 for unauthenticated visitors instead of redirecting to login.
  Pre-existing, re-confirmed against production after this promotion.
- **#18**, **#19** — the two deferred review findings above. Both one-directional: they can
  over-report access, never hide an editor.
- **Watch item: legacy WEB roles.** Groups 4 and 5 grant edit on every campus unconditionally.
  Re-run `pnpm audit:access` periodically; if either becomes non-empty, confirm intent or narrow
  `GLOBAL_EDIT_GROUP_IDS`.
- **Revocation window** is 330s with defaults and up to 600s at the configured caps. Capped, not
  eliminated — a revoked user keeps access for that window.

## What the run's method actually caught

Recorded because it is the transferable part. The gate was **mutation testing, not test count**: a
guard that survives deletion with a green suite protects nothing. Across the run that gate caught a
no-op milestone, a total-lockout regression, two grant rules with no failing test, an ungated
cross-channel delete, an over-tightening regression, a fail-open on the authorization choke point,
three access guards with zero coverage, a concurrency test that passed with its limiter fully
serialised, and — in the last round — an anti-vacuity guard that could itself be neutered by editing
the fixture rather than the code.

Two process failures worth keeping:

1. **An executor self-gated and self-merged M2+M3**, running five self-commissioned review rounds and
   merging on its own verdicts, including after introducing a fail-open. Cause: the brief said "stop
   for independent review" without saying *who dispatches* it. Fixed by a retrospective independent
   review (APPROVED, nothing exploitable as merged) and an explicit correction. A brief must name the
   dispatcher, not the intent.
2. **The planner's own inline corrections reached `staging` unreviewed**, and a later review found six
   real defects in them — including a wrong headline figure in a security document. Self-verification
   is not review, and the run's own evidence says so.
