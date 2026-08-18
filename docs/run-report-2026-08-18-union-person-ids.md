# Run report — 2026-08-18 — G14 re-close + person-id union

Gear: **full**. Planner: claude Opus. Repo: `runsheet.favor.church`.

## Goal

Union Rock group memberships across every id in the `rock_person_ids` claim,
instead of resolving roles from the single tie-broken `rock_person_id` — without
changing who the user is, and without any path that fails open.

Prerequisite work in the same run: re-close G14 (`email_verified` must be
affirmatively true before the Rock email fallback runs).

| Done criterion | Final verify output |
|---|---|
| `pnpm test` | `Test Suites: 27 passed, 27 total` / `Tests: 195 passed, 195 total` |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `pnpm lint` | 0 errors (3 pre-existing `react-hooks/exhaustive-deps` warnings) |
| `pnpm build` | `✓ Compiled successfully in 6.8s` |
| DC1–DC8 + P9–P13 mutation probes | 13/13 **KILLED** by a reverting edit |
| DC9 regression test | Exempt from probe by construction (passes against unchanged source) |

## Landed

| Milestone | PR | Merged into | Commits |
|---|---|---|---|
| G14 re-close | — (direct commit, user-directed) | `staging` (pushed) | `a0cfeac` |
| Plan doc | — (direct commit) | `staging` (pushed) | `90f6bc8` |
| M1 + M2 — union | **[#23](https://github.com/favorchurch/runsheet.favor.church/pull/23)** | **NOT MERGED — open** | `2bead83` |

Promotion chain read from the repo (`gh pr list --state merged`):
`feature → staging → main`. PR #23 is correctly based on `staging`.

## Route

One executor (sonnet, in-session) for T1+T2 — a single-repo, single-tree code
change with a fully specified plan, which is the executor's core case. It died
mid-run to an API error after finishing the code and tests but **before** running
any mutation probe; the planner took over the remaining verification rather than
re-dispatching, because the outstanding work was verification plus six surgical
review fixes whose briefs would have exceeded the edits.

Gear was full from the outset and never downgraded: an authorization change
destined for production is a one-way door.

## Task ledger

| Task | Brand | Review rounds | Verdict | Notes |
|---|---|---|---|---|
| Plan | claude Opus (planner) | 1 plan-review (Opus low) | `CHANGES REQUIRED` → rev 2 | 11 defects, all verified against source before folding in |
| T1+T2 code | sonnet executor, then planner | 2 code-review rounds | **APPROVED** | Round 1 (Opus): 6 defects. Round 2 (sonnet): approved, 1 non-blocking finding |
| T3 docs + land | claude Opus (planner) | — | Partial | Audit doc + PR done; merge not authorized |

Executor deaths: 2 (both API-side, not task failures) — the T1/T2 executor
("response stopped arriving") and the round-2 Opus reviewer ("individual spend
limit"). Neither was a defect in the work.

## Stops

| Stop | Asked | Answered |
|---|---|---|
| `rock_person_ids` semantics | The claim is every Rock Person sharing the login email — a household, not one person's merged duplicates. Union anyway, union only across Rock-merged `PersonAlias` rows, or don't union for access? | **Union across all candidate ids.** Household escalation explicitly accepted. Recorded in `docs/runsheet-access-audit.md` and at the top of PR #23. |
| Merge of #23 | Not asked — the plan did not name any merge | Run stopped at the open PR |

## Not verified

- **No live login was exercised.** Every guarantee is unit-tested against mocked
  Rock responses. No real Auth0 session, no real Rock instance, no browser.
- **The Auth0 claim was never observed in a live token.** `rock_person_ids` was
  confirmed by *reading* `~/Git/rock-auth0/src/post-login.js:680`; nobody decoded
  an actual ID token to confirm the tenant emits it in practice.
- **Round-2 code review ran at sonnet tier, not Opus.** The Opus reviewer died on
  an individual spend limit. Review stayed independent and adversarial, but by a
  weaker reader than round 1. This gate has not been re-run at Opus.
- **`MAX_UNION_PERSON_IDS` truncation has no test.** Verified by reading only.
- **No preview/staging deploy was exercised.** Nothing was smoke-tested on a
  deployed environment.
- **The household-escalation behaviour itself was never demonstrated end-to-end.**
  It is proven at the unit level; no two real Rock people sharing an email were
  logged in to watch roles combine.

## Still open

- **PR #23 is unmerged, deliberately.** The plan's `named_actions` covered commit,
  push and opening the PR. It did not name any merge, and `staging → main` deploys
  this access widening to production. Merging is the user's call.
- **[#24](https://github.com/favorchurch/runsheet.favor.church/issues/24) — the
  original login failure is still unfixed.** The reported symptom (empty roles)
  was never root-caused; the app-side widening that masked it was reverted as a
  security regression. Needs the affected accounts and their Auth0 connection,
  then a Post-Login Action fix.
- **[#25](https://github.com/favorchurch/runsheet.favor.church/issues/25) —
  `session.personId` flips between cache hit and miss** when the primary id fails
  validity and the email fallback resolves someone else. Pre-existing on `staging`;
  no authorization impact; made reachable by #23.
- **`npx` is broken on this machine** — `_load_nvm: command not found`, recursing
  until `FUNCNEST` is exhausted. Affects every `npx` invocation, not just the
  Auth0 CLI. Not filed as a repo issue: it is an environment problem, not a
  defect in this codebase.
- **Auth0 tenant connections were never enumerated.** Both attempts failed — the
  Management API call was blocked by the sandbox classifier for sending
  `AUTH0_CLIENT_SECRET` over the network, and the `auth0` CLI needs the broken
  `npx`.

## Incident: zombie executor left a live mutation in the working tree

Worth recording because it nearly shipped and was caught by the user asking, not
by a gate.

The T1/T2 executor was reported **failed** by a task notification an hour before
closeout, but `ListAgents` still showed it **running**. When stopped, it left
`if (false && secondaryPerson?.Id > 0)` applied in
`src/server-actions/internal/rockResolveAccess.ts` — a leftover mutation probe of
its own, never restored. Two tests were failing in the working tree at that moment.

`2bead83` was clean (the stray edit showed as uncommitted against it), so the
committed and pushed work was never contaminated, and restoring from `HEAD`
returned all four gates to green. But the run had already reported gates green
while a mutation sat in the tree.

**Rule this produces:** a task notification reporting an agent as failed is not
evidence that it stopped. Before any landing gate, run `ListAgents`, `TaskStop`
anything still live in this tree, and only then re-run the gate — a dead writer's
uncommitted mutation is indistinguishable from a real regression, and the gate
that would catch it runs *before* the corpse is cleared.
