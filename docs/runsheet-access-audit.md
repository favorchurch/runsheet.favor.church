# Runsheet access audit

**Audit status:** fixture-verified; live Rock figures pending the planner's
interactive pass.

This report documents the access model implemented by the runsheet app and the
read-only audit shipped in `scripts/audit-runsheet-access.ts`. The fixture
output in this document is not a production membership report. No live Rock
figures are claimed until the planner can run the live pass with an interactive
Rock session.

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

The fixture run proves the following shape: 10 active principals, 7 editors,
3 all-campus editors, and one Events Team with no resolvable campus. These are
test figures only. The fixture also proves that a live `IsLeader: false` Captain
does not become an editor merely because role id 69 was once in the fallback
list.

## Live audit placeholder

**Status: PENDING PLANNER LIVE PASS — no live figures are recorded here.**

The non-interactive `rock-mcp` session was probed three times on 2026-08-16 and
returned `user cancelled MCP tool call` each time. The fallback is therefore
active: the script and fixture verification ship now, while the planner fills
this section from an interactive read-only Rock pass.

Planner to record after the live run:

- audit timestamp and environment;
- active principal count and membership count;
- editor count and viewer count;
- count and identities of people with edit on every campus;
- membership counts for groups 2, 46, 32879, 4, and 5;
- GroupType 28 organization-unit membership counts;
- GroupType 23 Events Team membership counts;
- the live GroupType 23 `IsLeader` role table; and
- any Events Team matching the policy pattern but resolving to no campus.

The live command should be run with the read-only script, for example
`pnpm audit:access`, with `ROCK_API_URL` (or `NEXT_PUBLIC_ROCK_API_URL`) and
`ROCK_API_KEY` supplied. The script must not be changed to add a write path.

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
  fallback is attempted only for an Auth0 claim with `email_verified === true`.
- `IsArchived eq false` on `/GroupMembers` is not verified against live Rock.
  If Rock v17 rejects that field, `rawRockGet` throws and every user is denied,
  creating a total-outage path. The planner's live pass must verify this query
  shape before any production consideration.
- **N6:** after a genuinely deleted item is replayed, server behavior correctly
  rejects the non-owned numeric id, but the client can retain `deletedIds` after
  a failed save. This is a client fix and a follow-up issue, outside this audit.

### Watch item: legacy WEB roles

Groups 4 and 5 are legacy WEB roles receiving edit access on **every** campus.
Their real membership may be much wider than the intended Web Developer role.
The live audit must report their actual membership counts and identities before
anyone considers a production promotion. This run stops at `staging`.
