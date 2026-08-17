# Runsheet Access Tightening — Plan (rev 2, post plan-review)

**Date:** 2026-08-16
**Gear:** full (fit-test Q1 = yes — production-facing access control on a live app)
**Repo:** `runsheet.favor.church` (single repo → single executor)
**Executor:** codex CLI, model `gpt-5.6-luna`, effort `xhigh` (caller-specified)
**Reviewer:** fresh Opus high, resumed across rounds
**Landing:** merge each milestone to `staging`. **No production deploy.**

> **rev 2** incorporates an adversarial plan-review that returned CHANGES
> REQUIRED with 9 blocking findings. Six new defects (G9–G14) were found that
> rev 1 missed entirely, and one rev-1 design instruction was outright wrong
> (see B5 → §Design). Rev 1's G1–G8 were confirmed real.

---

## GOAL

Make `runsheet.favor.church` enforce, on the server, exactly this access model —
and nothing wider:

| Principal | Runsheet access |
|---|---|
| Rock Administration (grp 2), Global Staff (grp 46) | **Full**, all campuses |
| Staff in the Org Chart (GroupType 28) | **Edit**, own campus |
| `GLB \| Dashboard Creator` (grp 32879) | **Edit**, all campuses |
| Web Developer — `WEB - Administration` (4), `WEB - General Editor` (5) | **Edit**, all campuses |
| **Leaders** of any `* Events Team` (GroupType 23) | **Edit**, own campus |
| Any other Ministry Team member (GroupType 23) | **View only**, own campus |
| Everyone else, incl. authenticated users with no Rock membership | **Denied** |

"Denied" means denied on **every** server action, not just page render — the
central lesson of G9–G11 below.

Plus: an in-app View/Edit toggle that lets an editor *drop* to read-only, and
can never raise a viewer to editor.

### Non-goals

- No production deploy. No promotion past `staging`.
- No writes to Rock RMS of any kind. Rock work is **read-only audit only**.
- No changes to `~/Git/rock-security` (second repo — out of blast radius).
  The policy amendment ships as *proposed text* inside this repo's audit doc.
- No changes to Auth0 tenant configuration. (App-side verification of an Auth0
  claim is **in** scope — see G14.)

### Blast radius

`runsheet.favor.church` source only, merged to `staging`. Production Rock is
**read** by the M4 audit. Nothing outward-facing is sent.

---

## Recorded policy deviation

SECURITY-POLICY.md §1.1 (`:63`, `:64`) scopes `GLB | Web Developer` as *"CMS
only — **No person-data pages**"* and `GLB | Dashboard Creator` as *"Build only;
sees data only per their other roles."* Granting either **edit** on runsheets is
wider than the written policy.

Rico authorised this explicitly on 2026-08-16. It is implemented as specified
and recorded as a deviation in `docs/runsheet-access-audit.md`, which carries
the proposed §1.1 amendment text for `rock-security` to adopt separately.
No amendment is applied by this run.

---

## Findings

Verified by read-only inspection, 2026-08-16. G1–G8 from rev 1 (confirmed by
review); G9–G14 added by review.

### Mutation gaps

| # | Location | Defect |
|---|---|---|
| G1 | `rockBulkSaveRunsheetItems.ts:123` | Calls `getRockSession()` and **discards it**. No edit check, no campus check. Any authenticated user can POST/PATCH/DELETE runsheet items. **Critical.** |
| G2 | `rockCreateServiceRunsheet.ts:12` | Campus check only — a view-only ministry-team member can create runsheets. |
| G3 | `rockDuplicateServiceRunsheet.ts:23` | Same as G2. |
| G4 | `rockDeleteServiceRunsheet.ts:13` | Edit check but **no campus check** — an MNL editor can delete a BNE runsheet. |

### Read / enumeration gaps (new — rev 1 missed these entirely)

| # | Location | Defect |
|---|---|---|
| **G9** | `searchRockPeople.ts:27` | **No session check of any kind.** Only `assertAuthenticated` via `rockFetch`, which proves an Auth0 login and nothing more. A user rejected at `app/page.tsx:48` can still enumerate Rock people — names and emails, arbitrary query. SECURITY-POLICY `:182` seals person search by design. **Critical, and the most serious finding in the run.** |
| **G10** | `rockSearchSongs.ts:12`, `getRockContentChannelOptions.ts:15`, `rockGetScheduleOptions.ts:45` | No `getRockSession`. Same shape as G9, lower value. |
| **G11** | `app/api/song/route.ts:16` | Raw query param interpolated into the Rock **path** (`/ContentChannelItems/${idParam}`) with no `ContentChannelId` constraint on that branch. Any authenticated user reads any ContentChannelItem by id and can append OData to the path. |
| G5 | `rockGetRunsheetDetails.ts:156` | *Downgraded by review:* already fails closed via empty `runsheetCampuses`. Adding `canUserAccessRunsheet` is **defense-in-depth, not a bug fix.** |

`middleware.ts:10` excluding `/api` is a **red herring** — the middleware does no
authentication at all (host canonicalization + version cookie). Every route's
authN comes from `rockFetch`. The plan must state this, because any future route
that bypasses `rockFetch` is unauthenticated by default.

### Role-resolution gaps

| # | Location | Defect |
|---|---|---|
| G6 | `rockResolveAccess.ts:253` | `roleId 55\|20 && groupId 19109` — the Events Team rule, hardcoded to **MNL only**. Misses YTH (32929) and BNE (33310), and misses leader roles Captain (69) and Team Lead (75). |
| G7 | `getRockSession.ts:53` | Docstring asserts *"no authenticated user is blocked from viewing runsheets"* — the opposite of the intended model. |
| G8 | `rockResolveAccess.ts:156` | Membership query filters to GroupType 23, 28, and group 2 only. GroupType 1 is **never fetched**, so Dashboard Creator / Web Developer cannot be granted anything today. |
| **G14** | `getRockSession.ts:76` | Email fallback passes `profile.email` to a Rock lookup that returns that person's full `rolesMap`. **No `email_verified` check anywhere in `src/`.** If any Auth0 connection admits an unverified email, registering a staff email inherits staff access — and this run makes that inheritance more valuable. |

### Staleness / propagation gaps

| # | Location | Defect |
|---|---|---|
| **G12** | `sessionCache.ts:24,30` | Sessions cached as `session:v2:<personId>`, TTL 3600s; `getRockSession.ts:68-72` returns the cached `rolesMap`/`access` **before** calling `rockResolveAccess`. After merge, every already-cached user keeps **pre-tightening** roles for up to an hour. **Without a key bump this entire run is a no-op for active users.** |
| **G13** | `sessionCache.ts:70` | `clearSessionCache` fires only on logout/profile change. Revoking a Rock membership leaves editor rights live for the full TTL — compounded by `rockResolveAccess.ts:73` caching the `/GroupMembers` GET, so the real window is object-cache TTL + session TTL. |

### Campus boundary gap

| # | Location | Defect |
|---|---|---|
| **G15** | `runsheetCampus.ts:35` | `upper.includes(marker)` is an **unanchored substring match on a caller-supplied title.** `SEL` matches inside COUNSEL, SELAH, VESSEL, SELF. First hit wins in MNL→BNE→SEL order, so a two-marker title resolves MNL. Directly reachable: create/duplicate check the **title the caller sent**, so an MNL editor creates `"SEL Service (MNL Backup)"`, passes their own check, and plants a channel in another campus's namespace. Rev 1 declared this module "unchanged" and built all of M2 on it. |

Fail-closed on *empty* scope and *no-marker* titles is correct today and stays.

### Rock facts pinned (read-only, 2026-08-16)

- Events Teams, GroupType 23: `19109` MNL (parent 57 → MNL), `32929` YTH
  (parent 19114 → 57 → MNL), `33310` BNE (parent 59 → BNE). Existing ancestry
  walk resolves all three correctly — **no new campus-root mapping needed.**
- GroupType 23 leader roles: `20` Overall Head, `55` Unit Head, `69` Captain,
  `75` Team Lead. (`19` Member, `70` Potential Captain are **not** leaders.)
- `GLB | Dashboard Creator` = `32879`. `GLB | Web Developer` **does not exist
  yet**; §1.1 says it renames/reuses `WEB - Administration` (4) and
  `WEB - General Editor` (5).

---

## Design

Single source of truth, `src/lib/runsheetAccessPolicy.ts`:

```ts
GLOBAL_EDIT_GROUP_IDS = [2, 46, 32879, 4, 5]   // edit + ALL campuses
CAMPUS_EDIT_GROUP_TYPE_IDS = [28]              // edit, campus from ancestry
CAMPUS_VIEW_GROUP_TYPE_IDS = [23]              // view, campus from ancestry
EVENTS_TEAM_NAME_PATTERN = /events team$/i     // + leader role → campus edit
GROUP_TYPE_23_LEADER_ROLE_IDS = [20, 55, 69, 75]  // fallback only
```

Rules the executor must honour:

1. **Every `GLOBAL_EDIT_GROUP_IDS` match must also add `ALL_CAMPUSES` to
   `runsheetCampuses`.** Rev 1 omitted this and was wrong: `rockResolveAccess.ts:263-265`
   adds `ALL_CAMPUSES` only for groups 2 and 46, so a Dashboard Creator whose
   only membership is 32879 would get `editor` with `runsheetCampuses: []` →
   `canAccessRunsheetChannel` false for every channel → sees nothing and every
   write rejected. That contradicts the GOAL row. **Test 32879 and 4/5 explicitly.**
2. **Events Team leadership resolves via `GroupTypeRole.IsLeader`** fetched from
   Rock for GroupType 23, not hardcoded ids. The id list is a fallback used only
   if that fetch fails, and its use must be logged.
3. **Web Developer resolves by id 4/5 *and* by name `GLB | Web Developer`**, so
   the §1.1 rename does not silently drop access.
4. `resolveCampusFromAncestry` is **never called for GroupType 1** — those groups
   have `ParentGroupId: null` and would return null anyway. Stated so the
   executor does not invent a code path.

### Campus matcher hardening (G15)

- Anchor markers to a **prefix or word boundary**, not `includes`.
- At create/duplicate, **reject a title matching more than one campus** rather
  than silently taking the first.
- Tests: `COUNSEL`, `SELAH`, `VESSEL`, `SELF` must not resolve SEL;
  `"SEL Service (MNL Backup)"` must be rejected, not silently MNL.

### View/Edit toggle — security contract

Presentation only. `RunsheetManager.tsx:75` already computes `canEdit` and `:538`
already passes `readOnly={!canEdit}`, so this is smaller than rev 1 assumed.

- Server-side authority is `rolesMap` alone. The toggle's state is **never** read
  by any server action.
- Renders only when `canUserEditRunsheet(user)` is true.
- Toggling back to Edit re-checks `canUserEditRunsheet` before unlocking.
- **Default on load: View, for everyone including editors** (D1).

---

## Milestones

Each merges to `staging` as its own PR when its criteria go green.

### M1 — Access model

- `src/lib/runsheetAccessPolicy.ts` per Design, incl. rule 1.
- `rockResolveAccess` fetches GroupType **1** as well as 23/28 + group 2 (G8),
  consumes the policy module (G6).
- Add `IsArchived eq false` to the membership filter — archived Rock group
  members retain Active status and resolve today.
- **Bump session cache key `session:v2:` → `session:v3:` (G12).**
- **Cut the revocation window to ~5 min (G13 / D2):** lower `SESSION_CACHE_TTL`
  **and** the `/GroupMembers` object-cache TTL in `rockResolveAccess.ts:73`.
  Lowering only one leaves the window effectively unchanged — a test must assert
  both are ≤ 300s.
- `getRockSession` docstring corrected (G7).
- `email_verified === true` required before the email fallback (G14).
- Table-driven tests: one per GOAL row, **plus** 32879 and 4/5 receiving
  `ALL_CAMPUSES`; no Rock person; Rock person with zero memberships; Events Team
  *Member* (19) → view not edit; Potential Captain (70) → view not edit; YTH
  Events Team leader → campus MNL; unverified email → denied.

**Done when:** `pnpm test` + `pnpm lint` pass; every case above is a named
passing test; a test asserts the cache key is `v3`.

### M2 — Server-action enforcement

- Shared `assertRunsheetEditAccess(session, channelIdOrTitle)`; **every** mutating
  action routes through it.
- G1: in `rockBulkSaveRunsheetItems`, resolve the channel name and assert
  **before any mutating call — including the `rockPatch(ItemsManuallyOrdered)`
  inside `resolveChannel` at `:41`.** An assert placed after `:133` satisfies a
  naive reading and is explicitly **not** acceptable.
- G2, G3: assert edit before the existing campus check.
- G4: add the campus check.
- G5: add `canUserAccessRunsheet` as defense-in-depth (labelled as such).
- **G9:** gate `searchRockPeople` on **`canUserEditRunsheet`** (D3) — it is the
  assign affordance. Any UI that renders a person-search box must be hidden for
  viewers so this never surfaces as a broken control.
- **G10:** gate `rockSearchSongs`, `getRockContentChannelOptions`,
  `rockGetScheduleOptions` on **`canUserAccessRunsheet`** (viewer level, per D4 —
  these are runsheet content, not assignment).
- **G11:** in `app/api/song/route.ts`, validate `idParam` as a positive integer
  and constrain the query to the expected `ContentChannelId`; never interpolate
  caller input into a Rock path.
- Apply the G15 campus-matcher hardening.
- Add a comment in `middleware.ts` stating it performs **no** authN.
- Denials return the existing `{ success: false, error }` shape — no throw, no
  stack leak, no Rock id disclosure.

**Done when:** `pnpm test` + `pnpm lint` pass, and for **each** mutating action a
**behavioural** test mocks the session as (a) viewer and (b) cross-campus editor,
calls the action, and asserts **zero invocations** of the `rockPost`/`rockPatch`/
`rockDelete` wrappers. A grep-based check may ship only as a named lint backstop
with an explicit allowlist — **it does not satisfy this criterion**, because a
regex cannot prove the assert is awaited before the write and would pass the
exact defective ordering described in G1 above.

### M3 — View/Edit toggle

- Toggle in `RunsheetManager`, honouring every Design invariant.
- Tests per invariant, including "viewer cannot render or activate it".

**Done when:** `pnpm test` + `pnpm lint` pass; all invariants have named tests.

### M4 — Rock role audit

- `scripts/audit-runsheet-access.ts` — **read-only**. Enumerates members of every
  GOAL-table principal, reports who gains/loses access under the new model, and
  flags drift from SECURITY-POLICY §1.0–§1.3 (e.g. non-staff in
  `WEB - Administration`). Also reports any group matching the Events Team
  pattern that resolves to **no** campus.
- Unit-tested against fixtures so it is verifiable without credentials.
- Write-safety proven by a **behavioural** test (no write wrapper invoked), not a
  grep for verb strings — a grep trips on comments and misses `rockFetch(path, 'POST')`.
- `docs/runsheet-access-audit.md` — report, recorded deviation, proposed §1.1
  amendment text, and the stated G13 revocation window (see Q2).

**Done when:** `pnpm test` + `pnpm lint` pass, script green against fixtures, doc
contains deviation + amendment + revocation-window statement.

---

## Build gate

Per `AGENTS.md`: `pnpm lint` while iterating; **`pnpm build` must pass once**
before any milestone PR opens. Lint and typecheck do not catch Next.js
build-time failures.

---

## Dispatch

One executor, whole plan, dependency order M1 → M2 → M3 → M4.

| Task | Form | Brand / model / effort | Why |
|---|---|---|---|
| M1–M3 | executor in-session | codex `gpt-5.6-luna` xhigh | Auth logic on a long horizon with one consistent mental model; splitting risks two writers disagreeing about the policy module. |
| M4 script + live audit | executor worker | codex `gpt-5.6-luna` high | Mechanically separable, no shared state with M1–M3, cheaper at high. **Now holds its own Rock access** (below). |
| M4 report prose | executor in-session | codex `gpt-5.6-luna` xhigh | Must reflect deviation wording exactly. |
| Code review, every round | CLI | fresh Opus high | Anti-self-gating floor. |

### Rock access for the executor — corrected in rev 2

Rev 1 claimed Codex had no Rock MCP and made the live audit a planner-held
action. **That was wrong** — it grepped `config.toml`, but `codex mcp list` is
authoritative and shows `rock-mcp` → `https://rock-mcp.favor.church/mcp`,
`streamable_http`, enabled, OAuth.

The executor is therefore launched **with its own Rock access**, per the
delegate-with-access rule, using:

```
-c 'mcp_servers.rock-mcp={url="https://rock-mcp.favor.church/mcp",
     tools={rock_lookup={approval_mode="writes"},
            rock_entity={approval_mode="writes"}}}'
```

`approval_mode="writes"` is deliberate and is a **safety property, not a
convenience**: reads auto-approve so the audit runs unattended, while any write
still raises an approval that has no one to answer it in `codex exec` and
therefore **fails closed**. The default (`prompt`) cancels reads too, which is
what made the first probe return `ROCKMCP_FAIL user cancelled MCP tool call`.

**Probe result (3 attempts, 2026-08-16): FAILED.** All three returned
`ROCKMCP_FAIL user cancelled MCP tool call` — with `approval_mode` unset,
`"writes"`, and `"auto"`, and with stdin closed. The server is registered and
enabled, but its OAuth session does not reach non-interactive `codex exec`
(`codex mcp login rock-mcp` is interactive). Not retried further.

**Fallback is therefore ACTIVE for M4:** the executor writes and fixture-tests
`scripts/audit-runsheet-access.ts`; the **planner** produces the live principal
figures via its own Rock MCP and records in the doc that the script itself was
fixture-verified only. **The script ships either way.**

If Rico runs `codex mcp login rock-mcp` interactively before M4 begins, the
executor takes the live audit itself and the fallback is dropped.

**Planner-held:** any external send. None anticipated.

---

## Decisions (Rico, 2026-08-16) — binding

- **D1 — toggle default: View mode for everyone, editors included.** Rico
  overrode the rev-2 recommendation. Editors opt into editing each load.
- **D2 — revocation window (G13): shorten TTL to ~5 minutes.** Applies to the
  session cache and to the `/GroupMembers` object-cache entry that compounds it;
  both must come down or the window is unchanged. Accepts more Rock API calls
  per session as the cost.
- **D3 — `searchRockPeople`: editors only** (`canUserEditRunsheet`).

### D4 — The governing principle (Rico's clarification, supersedes conflicts)

> *"The person's access-level shouldn't limit what the runsheet app is able to
> do."* — Rico, 2026-08-16

**Authorization gates the user's actions, not the app's data reads.** The app
reads Rock through its service API key; a signed-in person's own Rock
permissions do **not** constrain what the runsheet can display.

Concretely:

- A **viewer** may see the whole runsheet, **including the names of people they
  could not see in Rock directly.** Rico confirmed this is intended and
  acceptable. Do **not** add per-person Rock permission filtering to displayed
  runsheet data.
- A **viewer may not**: edit the runsheet, edit platforms, assign people, or
  create a runsheet.
- `searchRockPeople` is editor-only (D3) because searching is the **assign**
  affordance, not because person data is itself secret to viewers.
- Therefore G10's reads (`rockSearchSongs`, `getRockContentChannelOptions`,
  `rockGetScheduleOptions`) gate at **viewer** level, not editor — they are
  runsheet content, and a viewer is entitled to see runsheet content.

**Executor: do not over-tighten reads in the name of this plan.** Denying a
viewer something they can legitimately view is a defect in this run, equal in
severity to leaving a write ungated.

### Second recorded deviation

D4 is a deliberate departure from SECURITY-POLICY `:182`, which seals person
search results per-principal. The runsheet app serves person *names* to any
viewer via the service key. Rico authorised this explicitly. It is recorded as a
second entry in `docs/runsheet-access-audit.md` alongside the §1.1 deviation.

---

## Risks

- **Lockout.** Tightening can deny someone relying on the G1/G9 holes. M4's audit
  surfaces this; landing on `staging` is the containment.
- **Web Developer breadth.** Groups 4/5 are legacy WEB roles whose membership may
  far exceed the intended `GLB | Web Developer`, and they are being granted edit
  on **every** campus. M4 reports that membership explicitly — review before any
  production promote.
- **`$top: 500` on memberships** (`rockResolveAccess.ts:146`): a person in >500
  groups could have security-role rows truncated. Fail-closed; noted, not fixed.
- **Events Team by name pattern.** A team named "Events Team" outside a campus
  root resolves to no campus → no access. Fail-closed, correct direction; M4
  reports any such group.
