# Plan: Fix issues #15, #18, and #19

## 1. Context

This plan addresses three verified issues in `runsheet.favor.church`:

1. **Issue #15**: Unauthenticated requests to `/create` and `/[channelId]` call
   `getRockSession()` unguarded. `getRockSession()` throws `Error('FORBIDDEN')`
   when there is no Auth0 session, producing an uncaught HTTP 500 instead of a
   redirect to login.
2. **Issue #18**: `isActiveMembership` (`scripts/audit-runsheet-access.ts:181`)
   accepts string-coerced `GroupMemberStatus` (`String(status) === '1'`) and
   string-coerced `IsArchived` (`String(archived).toLowerCase() !== 'true'`), but
   the fixture only carries numeric status and boolean archived values. Both
   string-coercion branches are untested, so removing them keeps the suite green.
3. **Issue #19**: `collectRunsheetAccessAudit` queries Rock with `$top: 2000`
   (`/Groups` ×3), `$top: 5000` (`/GroupMembers`), `$top: 100`
   (`/GroupTypeRoles`), and `$top: ROCK_FILTER_BATCH_SIZE` = 10 (`/People`) with
   no check for hitting the cap, risking silent truncation. The
   `/GroupTypeRoles` cap is also undisclosed in `docs/runsheet-access-audit.md`.

---

## 2. Global Constraints

- **Repository / Worktree Root**: `/Users/rico/Git/runsheet.favor.church/.worktrees/fix-issues-15-18-19`
- **Branch**: `fix/issues-15-18-19`
- **Tracking Issue**: #29
- **Package Manager**: `pnpm` (never `npm`/`yarn`)
- **Executor model — MANDATORY**: every task in this plan is executed by
  **`gemini-3.7-flash-high`**. No task may be routed to a Pro-tier model. If a
  dispatch mechanism defaults to Pro, override it explicitly per task.
- **Validation Commands**:
  - `pnpm lint` — runs `next lint --fix && tsc --noEmit`
  - `pnpm test` — runs `jest`
  - `pnpm audit:access -- --fixture` — offline audit run
  - *(Note: Per project user rules, Next.js build is not run to save time; lint, typecheck, and test suites are the validation gate).*
- **SemVer Rule**: bump `package.json` version `1.5.20` → `1.5.21` (patch).

### Pinned Interface Signatures (verified against working tree)

1. `requireServerSession` — `src/auth0-hooks/server/getServerSession.ts:38`
   `export async function requireServerSession(): Promise<Session>`
   Returns the session when `session?.user` is truthy; otherwise calls
   `redirect(`${loginPath}?returnTo=${encodeURIComponent(requestPath)}`)` where
   `loginPath = process.env.NEXT_PUBLIC_AUTH0_LOGIN || '/api/auth/login'` and
   `requestPath` is derived from the `x-invoke-path` / `x-invoke-query` headers,
   **falling back to `/`** when those headers are absent.
2. `getServerSession` — `src/auth0-hooks/server/getServerSession.ts:28`
   `export async function getServerSession(): Promise<Session | null | undefined>`
3. `getRockSession` — `src/auth0-hooks/server/getRockSession.ts:99`
   `export async function getRockSession(): Promise<RockSession>` — throws
   `Error('FORBIDDEN')` when unauthenticated.
4. `canUserAccessRunsheet` / `canUserEditRunsheet` — `src/lib/permissions.ts:10`, `:24`
5. `isActiveMembership` — `scripts/audit-runsheet-access.ts:181-188` (module-private)
6. `AuditMembership` — `scripts/audit-runsheet-access.ts:58-67`. **Already**
   typed `GroupMemberStatus?: number | string` and `IsArchived?: boolean | string`;
   do **not** re-widen it. Only the *fixture* interface
   (`scripts/audit-runsheet-access.fixtures.ts:8-16`) is narrow.
7. `RockReader.get` — `scripts/audit-runsheet-access.ts:45-47`
   `get(path: string, params?: Record<string, string | number | boolean>): Promise<unknown>`
8. `createReadOnlyRockReader` — `scripts/audit-runsheet-access.ts:298`
9. `createFixtureReader` — `scripts/audit-runsheet-access.ts:287` — currently
   declared `async get(path)`, **ignoring `params`** (see Task 3 trap).
10. `collectRunsheetAccessAudit` — `scripts/audit-runsheet-access.ts:328`
11. `ROCK_FILTER_BATCH_SIZE = 10` — `scripts/audit-runsheet-access.ts:28`

### Test-Harness Facts (verified)

- `jest.config.ts`: `preset: 'ts-jest'`, default
  `testEnvironment: 'jest-environment-node'`, `transform` uses
  `tsconfig.jest.json`, `moduleNameMapper` provides `^@/(.*)$ → src/$1` and
  stubs `server-only`.
- A test needing a DOM must opt in with a `/** @jest-environment jsdom */`
  docblock as the **first** lines of the file (see
  `tests/unit/components/RunsheetManager.toggle.test.tsx:1-3`).
- `tests/unit/pages/` does not exist yet and must be created.
- The audit test file defines its own `fixtureReader()` helper at
  `tests/unit/scripts/audit-runsheet-access.test.ts:32-42`, which — like
  `createFixtureReader` — ignores `$filter` and `$top`.

### Blast-Radius Ceiling

- **Allowed**: local edits and commits inside the worktree above, on branch
  `fix/issues-15-18-19`.
- **Prohibited**: no push, no PR, no remote or deploy actions, no live Rock API
  calls, no credential access, no edits outside the worktree.

---

## 3. Numbered Tasks

### Task 1 — Guard Unauthenticated Page Routes (#15)

- **Executor model**: `gemini-3.7-flash-high`
- **Files touched**:
  - `src/app/create/page.tsx`
  - `src/app/[channelId]/page.tsx`
  - `src/middleware.ts`
  - `tests/unit/pages/pageAuthGates.test.tsx` (new)

**Behavior**

1. `src/app/create/page.tsx`: import `requireServerSession` from
   `@/auth0-hooks/server/getServerSession` and `await requireServerSession()` as
   the **first statement** of `CreateRunsheetPage`, strictly before
   `await getRockSession()`.
2. `src/app/[channelId]/page.tsx`: same, in `DirectRunsheetPage`. Place
   `await requireServerSession()` before `await getRockSession()`. It may sit
   before or after `await params`; do not otherwise reorder existing logic.
3. Do **not** change the existing access-denied rendering, the view-only
   `redirect('/')` on `/create`, or the `RunsheetManager` props. Issue #15 is
   only about the unauthenticated 500.
4. `src/middleware.ts`: rewrite the comment at lines 48-49 so it states that the
   middleware performs no authentication or authorization, and that
   authentication and route access gates are enforced by page components and
   server actions via `requireServerSession()` / `getRockSession()`. Do not
   change middleware logic or the `config.matcher`.

**Test contract — `tests/unit/pages/pageAuthGates.test.tsx`**

These pages are async server components; `@testing-library/react` cannot render
them. Invoke the default-exported function directly and assert on mocks.

- Mock `@/auth0-hooks/server/getServerSession` with a `requireServerSession`
  jest mock, `@/auth0-hooks/server/getRockSession` with a `getRockSession` jest
  mock, `next/navigation` with a `redirect` jest mock, and
  `@/components/runsheet/RunsheetManager` with a stub component so the client
  component is not pulled into the node test environment.
- **Redirect mocks must throw.** The real `redirect()` throws to abort
  rendering; a no-op mock would let execution fall through to `getRockSession()`
  and mask the bug. Make the unauthenticated `requireServerSession` mock reject
  with a sentinel (e.g. `new Error('NEXT_REDIRECT')`) and assert the page
  rejects with it.
- Required cases, for **both** pages:
  1. Unauthenticated: page rejects with the redirect sentinel **and**
     `getRockSession` is never called. This is the anti-vacuity assertion — it
     fails if the guard is deleted, because the unguarded page would instead
     reject with `FORBIDDEN` from `getRockSession`.
  2. Authenticated with access: `requireServerSession` was called, and it was
     called before `getRockSession` (assert ordering via `mock.invocationCallOrder`).
  3. Authenticated without runsheet access: still renders the Access Restricted
     output; no login redirect.
  4. `/create` only: authenticated, has access, cannot edit → `redirect('/')`
     called.
- Do **not** assert an exact `returnTo` value produced by the real
  `requireServerSession`: `getRequestPath` reads `x-invoke-path`, which is not
  guaranteed present under Next 15 and degrades to `/`. The degraded `returnTo`
  is a pre-existing limitation and is **out of scope** here — record it, do not
  fix it.

**Verification**: `pnpm test tests/unit/pages/pageAuthGates.test.tsx`, then
`pnpm lint`.

---

### Task 2 — Cover `isActiveMembership` String-Coercion Branches (#18)

- **Executor model**: `gemini-3.7-flash-high`
- **Files touched**:
  - `scripts/audit-runsheet-access.fixtures.ts`
  - `tests/unit/scripts/audit-runsheet-access.test.ts`
  - `docs/runsheet-access-audit.md`

**Behavior**

1. `scripts/audit-runsheet-access.fixtures.ts`: widen `AuditFixtureMembership`
   to `GroupMemberStatus: number | string` and `IsArchived?: boolean | string`.
   Leave `AuditMembership` in the script alone — it is already wide.
2. Append two rows to `RUNSHEET_ACCESS_AUDIT_FIXTURE.memberships` (current
   length **12**, ids 1-12; new length **14**):
   - `{ Id: 13, PersonId: 112, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: '1' }`
   - `{ Id: 14, PersonId: 113, GroupId: 910, GroupRoleId: 19, GroupTypeId: 23, GroupMemberStatus: 1, IsArchived: 'True' }`
3. Append the matching people:
   - `{ Id: 112, FirstName: 'String', LastName: 'Status Member', Email: 'stringstatus@example.test' }`
   - `{ Id: 113, FirstName: 'String', LastName: 'Archived Member', Email: 'stringarchived@example.test' }`

   Names must render as `String Status Member` / `String Archived Member`
   (`principals[].name` is `[FirstName, LastName].join(' ')`).
4. Role 19 (`Member`) has `IsLeader: false`, so person 112 resolves to a
   **viewer**, not an editor. `report.summary.editorCount` must stay **7** and
   `allCampusEditorCount` **3** in the first test — do not change those.
5. `tests/unit/scripts/audit-runsheet-access.test.ts`, in
   `'drops inactive and archived memberships via isActiveMembership rather than counting them'`:
   - Update the `excluded` predicate so it also catches the string-archived row.
     The current predicate is
     `String(m.GroupMemberStatus) !== '1' || m.IsArchived === true`, which does
     **not** exclude `IsArchived: 'True'` and would compute 2, not 3. Mirror the
     production predicate: exclude when
     `String(m.GroupMemberStatus) !== '1' || (m.IsArchived !== undefined && String(m.IsArchived).toLowerCase() === 'true')`.
   - Assert the derivation `14 raw − 3 excluded = 11`:
     `expect(RUNSHEET_ACCESS_AUDIT_FIXTURE.memberships).toHaveLength(14)`,
     `expect(excluded).toHaveLength(3)`,
     `principalCount === memberships.length - excluded.length`,
     `principalCount === 11`, `activeMembershipCount === 11`.
   - Assert `byName.has('String Status Member') === true` and
     `byName.has('String Archived Member') === false`, alongside the existing
     `Inactive Member` / `Archived Member` assertions.
   - Update the explanatory comment block to describe 14 raw / 3 excluded and
     name the three excluded rows (110 inactive, 111 boolean-archived,
     113 string-archived).
6. `docs/runsheet-access-audit.md:51`: change `10 active principals` to
   `11 active principals`. Leave `7 editors` and `3 all-campus editors` as-is.

**Mutation sensitivity — must be demonstrated, then reverted**

The plan requires proof, not assertion. Using the backup-and-restore pattern
(`git checkout --` may be blocked; copy the file aside or reverse the edit by
hand), verify each mutant fails `pnpm test tests/unit/scripts/audit-runsheet-access.test.ts`:

- Mutant A: narrow `isActiveMembership` status check to `status === 1`
  → person 112 drops → counts fall to 10 → test fails.
- Mutant B: narrow the archived check to `archived !== true`
  → person 113 survives → counts rise to 12 → test fails.

Restore the file exactly after each probe and re-run the suite green. Report the
two failure outputs as evidence.

**Verification**: `pnpm test tests/unit/scripts/audit-runsheet-access.test.ts`
and `pnpm audit:access -- --fixture`.

---

### Task 3 — Rock `$top` Truncation Detection and Disclosure (#19)

- **Executor model**: `gemini-3.7-flash-high`
- **Depends on**: Task 2 (same test file and same doc file; sequential to avoid
  conflicting edits).
- **Files touched**:
  - `scripts/audit-runsheet-access.ts`
  - `tests/unit/scripts/audit-runsheet-access.test.ts`
  - `docs/runsheet-access-audit.md`

> **BLOCKING PREREQUISITE — read before writing any code.**
> The two offline fixture readers ignore `$filter` and `$top` and return the
> **entire** fixture array for every call:
> `createFixtureReader` (`scripts/audit-runsheet-access.ts:287`, signature
> `async get(path)`) and the test helper `fixtureReader()`
> (`tests/unit/scripts/audit-runsheet-access.test.ts:32-42`).
> `/People` is fetched with `$top: ROCK_FILTER_BATCH_SIZE` = **10**, but the
> fixture already carries **12** people (14 after Task 2). Adding a
> "returned > limit ⇒ throw" check without fixing these readers makes every
> fixture-backed test and `pnpm audit:access -- --fixture` throw a spurious
> truncation error. Fix the readers **first** (step 1), and only then add
> detection.

**Behavior**

1. Make both fixture readers honour the `$filter` person-id list for `/People`,
   returning only the people whose `Id` appears in the filter — mirroring what
   Rock does and what the already-correct `fetchImpl` in the
   `'chunks large Rock filters…'` test (lines 114-166) already does. Change
   `createFixtureReader`'s signature to `async get(path, params)` to read
   `params.$filter`. `/GroupMembers`, `/Groups`, and `/GroupTypeRoles` may keep
   returning full fixture arrays — 14 / 16 / 5 rows are far under their limits —
   but if you also filter `/GroupMembers` by `GroupId`, note the result is
   unchanged because `uniqueMemberships` already dedupes by
   `personId:groupId:roleId`.
2. In `scripts/audit-runsheet-access.ts` define, next to `ROCK_FILTER_BATCH_SIZE`:
   - `ROCK_GROUPS_FETCH_LIMIT = 2000`
   - `ROCK_LEADER_ROLES_FETCH_LIMIT = 100`
   - `ROCK_GROUP_MEMBERS_FETCH_LIMIT = 5000`
   - `ROCK_PEOPLE_FETCH_LIMIT = ROCK_FILTER_BATCH_SIZE`
3. Add one shared helper used by **all four** call sites, e.g.
   ```ts
   async function getBounded<T>(
     reader: RockReader,
     path: string,
     params: Record<string, string | number | boolean>,
     limit: number,
   ): Promise<T[]> {
     const rows = asArray<T>(await reader.get(path, { ...params, $top: limit + 1 }));
     if (rows.length > limit) {
       throw new Error(
         `Rock query for ${path} exceeded ${limit} rows; aborting audit to prevent silent truncation`,
       );
     }
     return rows;
   }
   ```
   Place the check in `collectRunsheetAccessAudit`'s call path (via this
   helper), **not** inside `createReadOnlyRockReader` — the reader is shared and
   has no notion of a per-endpoint limit, and the tests drive `collect…` with
   injected readers.
4. Convert all four sites in `collectRunsheetAccessAudit` (lines 329-333 for the
   three `/Groups` lookups and `/GroupTypeRoles`; the `/GroupMembers` fetch at
   ~line 355; the `/People` fetch at ~line 387) to `getBounded`, so each sends
   `$top: limit + 1` and throws above `limit`. Keep every existing `$filter` and
   `$select` string byte-identical — in particular the parenthesised
   `makeGroupFilter` disjunction and the `and GroupMemberStatus eq '1' and
   IsArchived eq false` suffix.
5. Preserve existing behavior otherwise: `asArray` normalisation, the
   `mapWithConcurrency` batching, `ROCK_MAX_CONCURRENT_REQUESTS`, and the
   `normalizeLeaderRoles` "Rock returned no GroupType 23 roles" error.

**Test contract — additions to `tests/unit/scripts/audit-runsheet-access.test.ts`**

- Four dedicated tests, one per endpoint (`/Groups`, `/GroupMembers`,
  `/People`, `/GroupTypeRoles`). Each uses a reader that behaves like the
  fixture reader for the other three paths but returns `limit + 1` synthetic
  rows for the endpoint under test, and asserts
  `await expect(collectRunsheetAccessAudit(reader)).rejects.toThrow(/exceeded \d+ rows; aborting audit/)`.
  Match on the message so a different incidental throw does not pass.
- Assert `$top` is actually sent as `limit + 1` for each endpoint (capture
  `params` in the injected reader) — otherwise a boundary-exact response would
  be indistinguishable from truncation.
- Sequencing note: `/GroupTypeRoles` and `/Groups` are awaited in the same
  `Promise.all`, and `/People` is only reached after memberships resolve. The
  `/People` and `/GroupMembers` cases therefore need the earlier paths to return
  valid fixture data (including at least one `IsLeader: true` role) so execution
  reaches the endpoint under test.
- Keep the existing five tests passing unchanged apart from Task 2's edits.

**Docs — `docs/runsheet-access-audit.md`**

Rewrite the residual-limitations paragraph (lines 73-79) to state that
`$top: N + 1` truncation detection is now active on all four Rock reads, that
the audit aborts with an error rather than silently under-reporting, and to
disclose all three caps: `/Groups` `$top: 2000` (×3 group types),
`/GroupMembers` `$top: 5000`, `/GroupTypeRoles` `$top: 100`, plus `/People`
`$top: ROCK_FILTER_BATCH_SIZE` (10) per id batch. Do not alter the live-figures
table or the reproducibility paragraph.

**Verification**: `pnpm test tests/unit/scripts/audit-runsheet-access.test.ts`,
then the full `pnpm test`, then `pnpm audit:access -- --fixture` (must exit
cleanly and report **11** active principals).

---

### Task 4 — SemVer Patch Bump

- **Executor model**: `gemini-3.7-flash-high`
- **Files touched**: `package.json`
- **Behavior**: `"version": "1.5.20"` → `"1.5.21"`. No other key changes; do not
  regenerate `pnpm-lock.yaml`.
- **Verification**: `pnpm lint`.

---

## 4. Dependency Graph & Waves

```dot
digraph G {
  rankdir=LR;
  Task1 [label="Task 1: Guard Page Routes (#15)"];
  Task2 [label="Task 2: Cover isActiveMembership (#18)"];
  Task3 [label="Task 3: Truncation Detection (#19)"];
  Task4 [label="Task 4: SemVer Bump"];

  Task1 -> Task4;
  Task2 -> Task3 [label="shared test + doc file"];
  Task3 -> Task4;
}
```

- **Wave 1** (parallel, disjoint file sets): Task 1 and Task 2.
- **Wave 2**: Task 3 — serialized after Task 2 because both edit
  `tests/unit/scripts/audit-runsheet-access.test.ts` and
  `docs/runsheet-access-audit.md`.
- **Wave 3**: Task 4, then the full gate: `pnpm lint && pnpm test && pnpm audit:access -- --fixture`.

Every wave is executed by `gemini-3.7-flash-high`.

---

## 5. Definition of Done

1. `pnpm lint` clean.
2. `pnpm test` green, including the new `tests/unit/pages/pageAuthGates.test.tsx`
   and the four new truncation tests.
3. `pnpm audit:access -- --fixture` exits 0 and reports 11 active principals,
   7 editors, 3 all-campus editors.
4. Mutation evidence for Task 2 (Mutants A and B) captured and the source
   restored.
5. `package.json` at `1.5.21`.
6. Work committed on `fix/issues-15-18-19`. No push, no PR.

---

## 6. Out of Scope

- Fixing `getRequestPath`'s reliance on `x-invoke-path` (degraded `returnTo`).
- Adding authentication to `src/middleware.ts` — comment-only change there.
- Household role unions, the Rock post-login action, and Rock write policies.
- Refactoring `RunsheetManager` client state or the `/[channelId]` client-side
  channel-existence fallback.
- Paginating past the `$top` caps; #19 is detect-and-abort, not paginate.
