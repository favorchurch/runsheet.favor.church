# Runsheet access audit

**Audit status:** fixture-verified, and a live read-only pass against prod
(`rock.favor.church`) was completed on 2026-08-17 — see *Live audit* below.

This report documents the access model implemented by the runsheet app and the
read-only audit shipped in `scripts/audit-runsheet-access.ts`. Figures labelled
*fixture* are illustrative only; the production membership figures are in the
*Live audit* section and are labelled as such.

## Access model as built

| GOAL principal | Effective runsheet access | Policy result |
|---|---|---|
| Rock Administration (group 2) and Global Staff (group 46) | Full access on every campus | `editor` + `viewer`, `runsheetCampuses: ['ALL']` |
| Staff in the Org Chart (GroupType 28) | Edit on the campus resolved from group ancestry | `editor` + `viewer`, own-campus scope |
| `GLB \| Dashboard Creator` (group 32879) | Edit on every campus | `editor` + `viewer`, `runsheetCampuses: ['ALL']` |
| Web Developer (`WEB - Administration` group 4 and `WEB - General Editor` group 5) | Edit on every campus | `editor` + `viewer`, `runsheetCampuses: ['ALL']` |
| Leader of a `* Events Team` (GroupType 23) | Edit on the team's resolved campus | `editor` + `viewer`, own-campus scope; leader status comes from live `GroupTypeRole.IsLeader` |
| Any other Ministry Team member (GroupType 23) | View only on the team's resolved campus | `viewer`, own-campus scope |
| Everyone else, including authenticated users without a Rock membership | Denied on every runsheet server action | empty runsheet roles and campus scope |

Every global group match adds `ALL` scope, including groups 32879, 4, and 5.
GroupType 28 and 23 campus scope is resolved through the existing ancestry
roots. GroupType 23 leadership uses Rock's live `IsLeader` values; the app's
documented fallback role ids are used only when that Rock lookup fails.

Authorization gates user actions, not the app's service-key data reads. A
viewer may read the complete authorized-campus runsheet, including person names
displayed in that runsheet. Viewers cannot edit the runsheet, edit platforms,
assign people, create, duplicate, delete, or bulk-save runsheet data.

## Audit implementation

The audit enumerates:

- GroupType 1 security roles, including required groups 2, 46, 32879, 4, and 5;
- all GroupType 28 organization units;
- all GroupType 23 ministry teams and their active memberships;
- GroupType 23 roles and their live `IsLeader` values; and
- the people represented by those memberships.

The audit passes each principal's memberships to the real
`resolveRunsheetAccessPolicy` function imported from
`src/lib/runsheetAccessPolicy.ts`. It does not reimplement the authorization
rules. Its Rock reader exposes only `get()` and hard-codes HTTP `GET`; the
behavioral test asserts that no `POST`, `PATCH`, or `DELETE` request is made.
The `--fixture` mode and fixture tests make the policy path verifiable without
credentials.

The fixture run proves the following shape: 11 active principals, 7 editors,
3 all-campus editors, and one Events Team with no resolvable campus. These are
test figures only. The fixture also proves that a live `IsLeader: false` Captain
does not become an editor merely because role id 69 was once in the fallback
list.

## Live audit — prod (`rock.favor.church`), 2026-08-17

**Status: COMPLETE.** Read-only pass via `pnpm audit:access`. No writes were
issued; the reader exposes only `get()`.

**Reproducibility — confirmed.** The figures below were first produced by the
script as it stood *before* two fixes landed in the same change set as this
section: the OData filter parenthesisation and the concurrency cap. The pre-fix
filter returned archived and inactive rows for all but the last id in each batch
(the client-side `isActiveMembership` re-filter is why the original counts were
still correct despite that). A second read-only pass against prod
(`rock.favor.church`) was run on 2026-08-17 with the shipped, post-fix script,
and every figure reproduced **exactly** — see the summary table and the
per-group, per-role breakdowns below. These numbers are confirmed, not merely
expected to agree.

Truncation detection is active via `$top: N + 1` bounded queries across all
four Rock read paths: `/Groups` at `$top: 2000` (for GroupTypes 1, 28, and 23),
`/GroupMembers` at `$top: 5000` per group batch, `/GroupTypeRoles` at `$top: 100`,
and `/People` at `$top: 10` (`ROCK_FILTER_BATCH_SIZE`) per id batch. If any
query returns more than its configured limit, the audit aborts immediately with
an error rather than silently truncating or under-reporting access.

### Summary

| Metric | Live value |
|---|---|
| Groups audited | 171 |
| Active memberships | 3,384 |
| Principals scanned | 1,494 |
| — of those, holding **any** runsheet access | 1,488 |
| — of those, holding **no** access | 6 |
| **View-only** (viewer, not editor) | **1,376** |
| **Editors** | **112** |
| **Edit on every campus** | **20** |
| Events Teams resolving to no campus | 0 |
| Required global group ids missing from Rock | none |

**Reading these rows.** The script's raw `viewerCount` is **1,488**, which counts
every principal with any view access **including all 112 editors** — editors are
added to `viewerGroupIds` unconditionally, and `canEdit ⇒ canView`. View-only is
therefore `1,488 − 112 = 1,376`. Do not add the viewer and editor rows together;
the buckets overlap completely on editors. The 6 remaining principals are members
of scanned GroupType 1 groups that are not global edit groups, so they resolve to
no runsheet access at all.

### Global edit groups — live membership counts

**These are membership counts, not distinct people.** Memberships are deduped on
`personId:groupId:groupRoleId`, so one person holding two roles in a group counts
twice. The three non-empty rows sum to 22 memberships, which resolve to **20
distinct people** — the difference is people who belong to more than one of these
groups, which is why the all-campus editor count is 20 rather than 22.

| Group | Id | Members |
|---|---|---|
| `RSR - Rock Administration` | 2 | 19 |
| `Global Staff` | 46 | 2 |
| `GLB \| Dashboard Creator` | 32879 | 1 |
| `WEB - Administration` | 4 | **0** |
| `WEB - General Editor` | 5 | **0** |

### Live GroupType 23 `IsLeader` table

| Role | Id | `IsLeader` |
|---|---|---|
| Overall Head | 20 | true |
| Unit Head | 55 | true |
| Captain | 69 | true |
| Team Lead | 75 | true |
| Member | 19 | false |
| Potential Captain | 70 | false |

### What the live pass established

- **The §1.1 deviation is currently theoretical, not live.** `WEB - Administration`
  and `WEB - General Editor` have **zero members**, so no one actually holds
  runsheet edit through the "CMS only, no person-data pages" roles. The watch item
  below stays open — membership can change at any time — but as of this pass the
  exposure is empty.
- **All-campus edit is 20 people**, essentially Rock Administration (19) plus
  Global Staff and one Dashboard Creator. Against 112 editors total, this is the
  set one would expect to hold full access.
- **The live leader roles match the hardcoded fallback `[20, 55, 69, 75]` exactly.**
  The assumption was correct and is now verified rather than trusted. Note that
  the *fixture* records Captain (69) as `isLeader: false` while live reports
  `true`; that divergence is deliberate and must not be "corrected" — it is what
  proves the audit reads the live roles feed rather than its own fixture.
- **`IsArchived eq false` is accepted by prod Rock (HTTP 200, verified
  2026-08-17).** This closes the total-outage risk noted below: had Rock v17
  rejected the field, `rawRockGet` would throw and every user would be denied.
- **No Events Team fails campus resolution** (`eventsTeamWithoutCampusCount: 0`),
  so the all-campus lockout this run guarded hardest against does not occur in
  real data.

### Deferred

The old-model gain/loss delta and the §1.0–§1.3 staff/non-staff drift comparison
remain unimplemented: there is no old-model baseline to diff against, and
producing either would mean fabricating a comparison. Recorded here so the gap is
visible rather than silent.

## Recorded deviations from `rock-security/SECURITY-POLICY.md`

These are recorded deviations only. This run does not modify
`~/Git/rock-security`.

1. **§1.1 — Web Developer and Dashboard Creator scope.** The policy describes
   `GLB | Web Developer` as “CMS only, no person-data pages” and `GLB | Dashboard
   Creator` as “build only; sees data only per their other roles.” The runsheet
   access model grants both the Web Developer groups (4 and 5) and Dashboard
   Creator (32879) runsheet edit on every campus. This was explicitly authorized
   for this app on 2026-08-16.
2. **`:182` — person-search boundary.** The policy seals person-search results
   per principal. Under D4, this app reads runsheet data through its Rock
   service key and serves person names displayed in the runsheet to any
   authorized viewer. Person search remains an editor-only assignment affordance;
   displayed runsheet names are not filtered per the viewer's personal Rock
   permissions.
3. **D5 — runsheet enumeration.** The roster filter on runsheet enumeration is
   deliberately removed. Campus viewers see all runsheets for their authorized
   campus, regardless of roster membership (Rico, 2026-08-16). This is tracked
   in issue #10.

## Revocation window (G13 / D2)

Each cache is capped at **≤300 seconds (5 minutes)**: the session cache, the
`/GroupMembers` object cache, and `ROCK_FETCH_REVALIDATE_SECONDS`. The
compounded worst-case revocation window is the object-cache TTL plus the session
TTL: approximately **330 seconds with the defaults** (30s + 300s), and up to
**600 seconds at the configured caps** (300s + 300s). Capping only one cache
would leave the revocation window effectively unchanged if the other cache could
still serve stale authorization data, which is why both are clamped.

## Proposed amendment text for SECURITY-POLICY §1.1

Proposal only; this text is not applied to `~/Git/rock-security` by this run:

> **Runsheet application exception.** For `runsheet.favor.church` only,
> membership in `GLB | Dashboard Creator` grants edit access to runsheet
> content on all campuses, and membership in `GLB | Web Developer` (the
> `WEB - Administration` and `WEB - General Editor` groups while those legacy
> groups remain in use) grants the same runsheet edit access. These are
> application-level grants and do not grant Rock internal People, person-data,
> or other page/REST access. The runsheet application serves its authorized
> runsheet display through its service key; an authorized viewer may see names
> already displayed in that runsheet. Any broader CMS, person-data, or REST
> permissions remain governed by the rest of this policy.

## Carried items and risks

- The `|| profile.name` fallback was removed from `getRockSession`; Rock email
  fallback is attempted only for an Auth0 claim with `email_verified === true`
  (or the string `'true'`, for IdPs that stringify it).
- **ACCEPTED RISK: household role union (Rico's decision, 2026-08-18).** Access
  resolution now unions Rock group memberships across every id in the
  `rock_person_ids` claim, not just the tie-broken `rock_person_id`. That claim
  is **all Rock People sharing the login email address**
  (`rock-auth0/src/post-login.js:73` — `Email eq '<login email>'` plus
  status/deceased filters), which the Auth0 Action's own comments call a
  "duplicate-email household" — not one human's merged duplicates. **Consequence:
  household members sharing an email address inherit each other's runsheet
  access**; a teenager on a staff parent's email address gets staff edit. Two
  narrower designs were offered and declined: no union for access, and union only
  across Rock-merged `PersonAlias` rows. This is a deliberate product decision,
  **not** a defect — do not "fix" it back without asking Rico. Contained by: the
  union is gated on `personFound !== false && personId > 0` (so it cannot revive
  the G14 email path below), identity still resolves from the primary id alone,
  every secondary id is re-validated via `fetchPersonById`, and the session cache
  key carries a digest of the union set. If the goal ever becomes genuine
  duplicate consolidation, the right fix is Rock-side person merges
  (`~/Git/rock-automerge`), not a wider claim.
- **G14 regression — reopened and re-closed 2026-08-18.** Commit `8b57b66`
  ("tolerate social/enterprise claims") widened the gate to
  `emailVerifiedClaim !== false && rawEmail.length > 0`, so an *omitted*
  `email_verified` claim once again resolved by email and inherited that Rock
  person's full `rolesMap` — the exact G14 finding. The widened branch shipped
  with **no test**: its test asserted only the `email_verified: true` case that
  already passed beforehand, while its name claimed to cover the omitted case.
  Now narrowed back to affirmative-only and pinned by three tests (omitted
  claim, non-boolean claim, and `rock_person_id` present with an unverified
  email), each verified to fail against the reverted source. Note that
  `src/app/api/auth/[auth0]/route.ts` pins no `connection`, so every connection
  enabled on the Auth0 app is a live login path — this check, not the current
  tenant config, is what keeps a future non-verifying connection from becoming
  a staff-access path. If a real login breaks for missing claims, fix the
  Auth0 Post-Login Action; do not widen this gate.
- `IsArchived eq false` on `/GroupMembers` — **RESOLVED 2026-08-17.** Verified
  accepted by prod Rock (`HTTP 200`, rows returned) before the production
  promotion. Had Rock v17 rejected the field, `rawRockGet` would throw and every
  user would be denied — a total-outage path. It fails closed, so the risk was an
  outage rather than a breach; it is now closed either way. Re-verify if the Rock
  version changes.
- **N6:** after a genuinely deleted item is replayed, server behavior correctly
  rejects the non-owned numeric id, but the client can retain `deletedIds` after
  a failed save. This is a client fix and a follow-up issue, outside this audit.

### Watch item: legacy WEB roles

Groups 4 and 5 are legacy WEB roles receiving edit access on **every** campus.
Their real membership may be much wider than the intended Web Developer role.

**Resolved for now (live pass, prod, 2026-08-17): both groups have ZERO members.**
Nobody currently holds runsheet edit through them, so the §1.1 deviation is
theoretical rather than live.

This item stays open regardless, for two reasons: membership can be added at any
time without touching this app, and the grant is unconditional — anyone added to
either group immediately gets edit on every campus. Re-run `pnpm audit:access`
periodically and check the `WEB - Administration` / `WEB - General Editor` rows.
If either becomes non-empty, confirm the members are intended to hold runsheet
edit, or narrow `GLOBAL_EDIT_GROUP_IDS` in `src/lib/runsheetAccessPolicy.ts`.

The access-control work (M1-M4) was promoted to production on 2026-08-17 (PR #14,
`main` @ `949807a`) after the live pass confirmed the above and after
`IsArchived eq false` was verified against prod Rock. This change set — the
audit-tooling fixes and this doc section — touches only `scripts/`, `tests/`,
and `docs/`; it contains no app code, so production runsheet behaviour is
unaffected by it regardless of when or where it merges.
