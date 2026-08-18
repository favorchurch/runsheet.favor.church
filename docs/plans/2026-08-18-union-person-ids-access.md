# Union candidate person ids into access resolution

**Date:** 2026-08-18 · **Gear:** full · **Repo:** runsheet.favor.church
**Revision:** 2 (plan-review round 1 returned CHANGES REQUIRED; 11 defects folded in)

## GOAL

Access-level resolution unions Rock group memberships across every id in the
`https://auth.favor.church/rock_person_ids` claim, instead of resolving roles
from the single tie-broken `rock_person_id` — without changing who the user is,
and without any path that fails open.

## Accepted risk (Rico's decision, 2026-08-18)

`rock_person_ids` is **all Rock People sharing the login email address**
(`~/Git/rock-auth0/src/post-login.js:73` — `Email eq '<login email>'` plus
status/deceased filters), not one human's merged duplicates. The Action's own
comments call this a "duplicate-email household."

Unioning roles therefore grants **household members sharing an email address
each other's runsheet access** — a teenager on a staff parent's email address
inherits staff edit. Two safer options were offered (no union for access; union
only across Rock-merged `PersonAlias` rows). Rico chose union-across-all-candidates
with this consequence stated. Recorded so a future reader does not "fix" it back.

## Non-goals

- No production deploy. No Vercel promotion. Not named, so not authorized.
- No changes to `~/Git/rock-auth0`.
- No Rock data changes; no person merges.
- The `email_verified` gate re-closed in `a0cfeac` must remain effective. T2's
  union gate (below) is what keeps that true.

## Blast radius

`runsheet.favor.church` app code only. Branch off `staging`, PR into `staging`.
`main` untouched.

## Facts established in Phase 1 (verified against source)

- Claim emitted at `post-login.js:680-681`, namespace `https://auth.favor.church`.
- Shape: `number[]`, deduped, **sorted ascending** (`post-login.js:677`). So claim
  order is id order, **not** primary-first.
- Action omits the claim when the candidate fetch was `truncated`, and when the
  union does not contain the scalar id (`post-login.js:673,678`). Absence means
  "do not trust a partial set" and must keep failing closed to `[personId]`.
- Real candidate cap: `MAX_PERSON_CANDIDATES = 10`
  (`~/Git/rock-auth0/src/common/person-match.js:58`), `PERSON_FETCH_LIMIT = 11`.
- App side: `personIds` parsed at `getRockSession.ts:72`, **zero consumers** today.
- `fetchTeamMemberships` (`rockResolveAccess.ts:122`) filters only on
  `GroupMemberStatus`/`IsArchived` — it has **no** `RecordStatusValueId`/
  `IsDeceased` guard. Only `fetchPersonById` (`:100`) applies person validity.
- `parseRockPersonIds` (`getRockSession.ts:29-33`) rejects the **whole array** if
  any element is non-positive or non-integer, falling back to `[personId]`.

## Tasks

### T1 — `rockResolveAccess` unions memberships across ids

`src/server-actions/internal/rockResolveAccess.ts`

- Signature becomes `rockResolveAccess(personIds: number[], fallbackEmail?: string)`.
  **Contract: `personIds[0]` is the primary identity.** T2 is responsible for
  constructing that order; T1 may assume it and must document it.
- **Identity stays primary-only.** `contact` (name, email, campusId,
  primaryAliasId) resolves from `personIds[0]` alone. The union changes
  authorization, never identity.
- **Validate every secondary id** with `fetchPersonById` before using it. Ids that
  do not resolve through that validity filter (inactive, deceased, merged away)
  are dropped. This closes the token-lifetime fail-open where a deactivated
  person's roles keep unioning. It is also the fetch that supplies each id's
  `PrimaryCampusId` for the `campusIds` union.
- Merge all surviving ids' memberships into one list before the existing
  group/role logic runs; reuse `fetchTeamMemberships` and its object cache.
  Union `rolesMap`, `runsheetCampuses`, `campusIds`.
- **Cap `MAX_UNION_PERSON_IDS = 11`** (matching `PERSON_FETCH_LIMIT`). Truncation
  **always retains `personIds[0]`** and drops from the tail; log when it fires.
- **Error policy, explicit:**
  - A failure resolving the **primary** id **propagates** (preserves today's
    behavior at `rockResolveAccess.ts:83-86`, incl. `CloudflareBlockError`).
  - A failure on a **secondary** id drops that id from the union and marks the
    result `partial: true` on `ResolveResult`.
- Defensive per-id filter for `<= 0`/non-integer stays, documented as
  defence-in-depth (unreachable via `parseRockPersonIds`' all-or-nothing gate).
- **Update the 6 existing scalar call sites** in
  `src/server-actions/internal/rockResolveAccess.test.ts:62,76,94,112,132,155`.

**Dispatch:** executor in-session. **Validation:** `pnpm test`.

### T2 — thread `personIds` through `getRockSession`, gate it, fix the cache key

`src/auth0-hooks/server/getRockSession.ts`, `src/server-actions/sessionCache.ts`

- **Gate the union.** Union only when `personFound !== false && personId > 0`.
  When the app distrusted the scalar id, the claimed id array must **not**
  resurrect roles — otherwise T2 defeats the `email_verified` gate from `a0cfeac`.
  Ungated sessions resolve exactly as today.
- **Order explicitly:** build `[personId, ...personIds.filter(id => id !== personId)]`.
  Do not pass the claim array through as-is — it is ascending, so `personIds[0]`
  would otherwise be the lowest-id household member and T1 would bind identity
  to them.
- **Cache key, fully specified.** Add one exported helper used by *all three*
  sites so read, write, and invalidate cannot diverge:
  `sessionCacheKey(primaryId, unionIds)` → `session:v5:<primaryId>:<digest>`,
  where `digest` is a stable short hash of the sorted, deduped union set
  (`none` when the union is just `[primaryId]`, so ungated sessions keep a
  single stable key). Compute the id set **once** in `getRockSession` and use
  that same value for `getSessionCache` and `setSessionCache` — note the write
  currently keys on `resolvedPersonId` (`:94-97`) while the read keys on
  `personId` (`:86`), which would otherwise guarantee a 100% miss.
- **Never cache a degraded result:** skip `setSessionCache` when
  `resolved.partial === true`.
- **`invalidateRockSession` (`:111-124`) must clear the same key.** Re-derive the
  claim-based union set with the same helper so logout/profile-change actually
  evicts; today it would clear a key nothing wrote and elevated household roles
  would survive the full TTL.
- **Update `src/server-actions/sessionCache.test.ts:37`** (asserts `session:v4:42`).

**Dispatch:** executor in-session. **Validation:** `pnpm test`.

### T3 — record the decision and land it

- Add the accepted-risk entry to `docs/runsheet-access-audit.md` carried items,
  naming Rico's 2026-08-18 decision and the household-escalation consequence.
- Commit, push branch.
- **Planner** opens the PR into `staging` (outward-facing action).

**Validation:** PR URL.

## Done criteria (milestones)

**M1 (T1+T2) — all four gates green:** `pnpm test`; `tsc --noEmit` exit 0;
`pnpm lint` no new errors; `pnpm build` succeeds.

New tests must prove:
1. Union grants a second id's roles (gated session).
2. `contact.id`/`fullName` come from the **scalar claim id**, even when the
   claim's lowest id is a different person.
3. `personFound: false` or `personId === 0` ⇒ **no** union, roles stay empty.
4. A secondary id failing `fetchPersonById` validity is dropped from the union.
5. Primary-id fetch failure still **propagates** (`CloudflareBlockError`).
6. `partial: true` result is **not** written to the session cache.
7. Two different id-sets sharing one primary id get **different** cache keys;
   read and write use the **same** key (assert one round-trip hits).
8. `invalidateRockSession` clears the key the session actually wrote.
9. Absent/rejected claim ⇒ behavior identical to today. *(Regression test —
   exempt from the mutation probe below by construction.)*

**Mutation probe:** tests 1–8 each verified to fail against the pre-change
source. Test 9 is exempt: it passes against unchanged source by design.

**M2 (T3):** audit doc updated; PR open into `staging`.

## Review gate

Fresh Opus code reviewer after M1, before the PR. Evidence = pasted command
output, not a success claim. `CHANGES REQUIRED` re-enters the fix loop; 5-round
cap; 2 total `CHANGES REQUIRED` on one task ⇒ presume `PLAN DEFECT`, re-plan.
