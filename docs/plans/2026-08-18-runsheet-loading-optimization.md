# Runsheet loading optimization — approval plan

Status: awaiting explicit user approval
Plan version: 1
Repository: `/Users/rico/Git/runsheet.favor.church`
Executor worktree: `/Users/rico/Git/runsheet.favor.church/.worktrees/luna-runsheet-loading`
Base commit: `4df2bca43177f938be04c7aa609a25aaab797bad`

## Context

Selecting a runsheet currently invokes `rockGetRunsheetDetails` from local component state and
shows a text-only loading state until the complete payload arrives. The app already has a shared
Redis object cache and Next.js tagged fetch caching in `rockFetch`, but the runsheet channel list
and detail reads explicitly pass `noCache=true`, so those reads bypass both caches. The detail
action also fetches the channel, attributes, and rows in a serial dependency chain even though
attributes and rows can run together after the channel type is known.

The goal is a fast first render under three seconds in the normal production path, with table
content able to appear behind useful loading UI, and with repeated Sunday views benefiting from
both shared server caching and per-browser query caching. Runsheets are updated on weekdays, so
successful writes must invalidate or reconcile cached data rather than leaving a permanently
stale client result.

## Global Constraints

- **User requirement:** Use cached Next.js API/data calls, React Query, and optimistic client-side
  updates with fetching spinners or equivalent caching techniques to keep runsheet loading quick.
- **User requirement:** Show skeletons when loading tables.
- **Performance target:** First runsheet load is less than three seconds in the normal production
  path; independent body work should load in parallel.
- **Freshness model:** Runsheets are updated every weekday; cache invalidation/revalidation must
  preserve same-day correctness after an app write while allowing shared Sunday reads to reuse
  cached responses.
- **Repository instruction (verbatim):** `Use semver to update versions`
- **Framework/data source:** Next.js 15.5.14, React 19, existing server actions, and Rock RMS
  accessed through `src/server-actions/internal/rockFetch.ts`.
- **Protected paths:** The primary checkout on `main` is protected and must remain unchanged;
  the executor may write only in the named executor worktree. Existing uncommitted changes at
  planning time: none.
- **Validation commands:** `pnpm typecheck`; focused Jest tests for changed runsheet query,
  manager, table-editor, and Rock detail code; `pnpm test -- --runInBand`; `pnpm build`.
  Dependency installation is setup only and must use the committed lockfile.

### Blast-radius ceiling

This run may edit and commit source, tests, package metadata, lockfile entries required by the
source change, and the plan/handoff files in the executor worktree only. It may read local files
and run local validation commands. It may not push, open or merge a PR, deploy, alter remotes or
DNS, change production configuration, access or create credentials, write to Rock RMS or Redis,
send messages, or modify the protected primary checkout. No production data or external service
mutation is authorized.

## Routing and dispatch

Routing: full luna-office; one executor, one fresh reviewer, and fresh Luna fix workers only if
the reviewer requires changes. Reason: production-facing performance behavior needs an independent
gate, while the implementation is one tightly coupled client/server slice.

Dispatch count: one implementation writer in the executor worktree, followed by one independent
reviewer in that same worktree; no parallel writers because the query/provider/editor changes
overlap.

Delegation rationale: the executor buys an isolated implementation and the reviewer buys a fresh
adversarial read of cache freshness, authorization boundaries, and loading-state races.

## Tasks

### Wave 1 — server caching and parallel detail reads

#### Task 1 — Make runsheet reads cacheable and parallel

Depends on: none

Touches: `src/server-actions/rockGetAvailableRunsheetChannels.ts`,
`src/server-actions/rockGetRunsheetDetails.ts`, any narrowly scoped shared cache helper needed by
those actions, and focused server-action tests.

Strategy: Luna executor; the task is tightly coupled to the existing Rock fetch/cache contract.

Implement:

1. Stop bypassing the existing cache for authorized runsheet GETs. Preserve the existing access
   checks before returning data; cache only the Rock read responses behind the already centralized
   `rockFetch` policy.
2. Preserve write invalidation behavior. A successful runsheet write must make subsequent detail
   queries reconcile with Rock through the existing Redis version bust and Next tagged revalidation
   path.
3. After the channel/type lookup, fetch item attributes and content-channel items concurrently.
   Keep person-name batching bounded and parallel as it is today; do not introduce one request per
   person cell.
4. Keep the response shape and authorization semantics unchanged.

Verification:

- Add/update tests that fail if the runsheet reads still force `noCache=true`.
- Add/update tests that prove independent attribute/item reads are started without serial waiting,
  and that malformed or unauthorized channels still fail safely.
- Run the focused server-action tests and typecheck.

### Wave 2 — React Query cache, optimistic reconciliation, and loading UI

Depends on: Task 1

Touches: `src/app/layout.tsx`, `src/components/providers/` (new provider if needed),
`src/components/runsheet/RunsheetManager.tsx`, `src/components/runsheet/RunsheetTableEditor.tsx`,
`src/components/runsheet/RunsheetCompareView.tsx` only if its existing batch load is migrated,
new runsheet query/skeleton modules under `src/`, the relevant component tests, `package.json`,
and `pnpm-lock.yaml` only if dependency metadata changes.

Strategy: Luna executor; the task owns the connected client lifecycle and must preserve unsaved
navigation behavior.

Implement:

1. Add one app-level React Query client provider using the installed `react-query` v3 package.
   Configure stable query keys, a bounded browser cache, stale-while-revalidate behavior, retry
   behavior appropriate for a user-facing Rock read, and no unnecessary refetch storm on focus.
   Keep cache policy values explicit and documented for weekday edits/Sunday read volume.
2. Replace RunsheetManager's duplicated `useEffect` fetch state with queries for the available
   channel list and selected runsheet details. Both queries must be allowed to start in parallel
   on direct navigation. Preserve stale-data guards, URL navigation, unsaved-change prompts,
   access failures, archived filtering, and the existing retry/error behavior.
3. Reconcile the query cache after successful table saves: update the selected runsheet cache from
   the editor's already-local optimistic state, then revalidate in the background so the server
   remains authoritative. On failed saves, retain the current rollback/error behavior and do not
   publish a false successful cache result. Creation and deletion flows must invalidate the list
   and affected detail keys.
4. Replace text-only table waiting with accessible skeleton table rows/cells. Show a small fetching
   spinner or equivalent non-blocking indicator for background refetches and channel transitions.
   The skeleton must not expose editable controls for data that has not loaded.
5. Keep compare-view behavior correct. If it remains on the existing batch action, at minimum
   invalidate/reuse the same detail cache keys where appropriate; migrating it to the shared query
   hook is allowed only if it does not widen the change or weaken its read-only guarantees.
6. Bump the application version from `1.5.20` to `1.6.0` using semver. Do not change unrelated
   dependency versions.

Verification:

- Add/update component tests for provider-backed query loading, cache reuse on repeated channel
  selection, skeleton rendering, fetching spinner behavior, and optimistic save reconciliation.
- Preserve and run existing manager toggle/compare and table-editor dirty/propagate tests.
- Run focused Jest tests, the full Jest suite, typecheck, and production build.
- If a live Rock/production performance environment is unavailable, report the under-three-second
  target as not verified rather than claiming it passed; code-level evidence must still show the
  cache and parallelism paths.

## Milestone

### M1 — Runsheet selection is cached, parallel, and visibly progressive

One milestone because provider, query, server-cache, optimistic reconciliation, and skeleton
changes must land together to keep the application shippable. Done criteria:

- Authorized runsheet reads use the existing shared cache path and preserve write invalidation.
- Detail attributes/items fetch in parallel after the channel lookup.
- Direct navigation starts channel-list and detail queries in parallel.
- Repeated selection can reuse the browser query cache; successful saves reconcile it and background
  refreshes remain server-authoritative.
- Loading tables render skeletons and background fetches show a spinner/indicator.
- Relevant tests, full tests, typecheck, and build pass with real output.
- `package.json` reports semver `1.6.0`.

Landing: executor commit in the executor worktree after the independent review approves it. No PR,
merge, push, deployment, or production apply is authorized by this plan.

## Named actions

None. This plan authorizes no planner-held external mutation; closeout is limited to local review,
verification, and reporting the executor commit.

## Out of scope

- Deploying or benchmarking against production, staging, Rock RMS, Redis, or a live browser fleet.
- Changing Rock schemas, API contracts, authorization policy, or write endpoints.
- Replacing React Query, upgrading unrelated dependencies, or redesigning the entire runsheet
  editor.
- Prefetching every accessible runsheet or loading all Sunday content into every browser.
- Reworking unrelated search dropdowns, create forms, or non-runsheet pages.
- Opening, pushing, merging, or publishing a PR.

## Baseline evidence

- Base commit: `4df2bca43177f938be04c7aa609a25aaab797bad`.
- Primary checkout was clean at planning time.
- `react-query` is already declared in `package.json`; no new dependency is required for the
  planned provider.
- Baseline focused tests and typecheck were attempted in the fresh worktree but could not run
  because `node_modules` is absent (`jest: command not found`; TypeScript launcher reported that
  the compiler is not installed). The executor may install from the lockfile before validation.
