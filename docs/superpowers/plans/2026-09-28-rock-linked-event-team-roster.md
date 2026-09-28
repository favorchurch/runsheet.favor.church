# Rock-Linked Event Team Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ten vital roles on the Event Team Roster card autofill from Rock Group Scheduler for the runsheet's own campus, date and service time, and editing one of those roles schedules or unschedules that person in Rock; and archived runsheets list most-recent-first.

**Architecture:** Three new pure modules carry all the logic — a role→group/location mapping table, a channel-name→Rock-schedule resolver, and a slot-fill diff. Two new server actions wrap them in Rock I/O: one read (`rockGetRosterAssignments`) and one write (`rockSyncRosterRole`), the write going through Rock's own Group Scheduler REST actions. The `EventTeamRosterCard` renders Rock's answer for linked roles and keeps the existing `Roster: <role>` content-channel items as a mirror so propagate, compare and print are unaffected.

**Tech Stack:** TypeScript, Next.js 15 server actions, React Query v4, Rock RMS REST v17, Jest + ts-jest, Tailwind.

## Global Constraints

- **Campus scope: MNL only.** `extractRunsheetCampus(channelName) !== 'MNL'` → the runsheet is unlinked and the card behaves exactly as it does today. BNE/SEL are out of scope.
- **Role mapping, verified in production Rock on 2026-09-28.** A Group Scheduler *role* is a `Location`; a *service* is a `Schedule`.

| Runsheet role (`VITAL_ROLES`) | groupId | locationIds, in fill order |
|---|---|---|
| Service Director | 19100 | 475 |
| Stage Manager Captain | 19100 | 479 |
| Assistant Stage Managers | 19100 | 480 |
| Service Producer | 19109 | 661 |
| Assistant Service Producers | 19109 | 662 |
| Music Director | 19095 | 794 |
| Worship Leaders | 19095 | 799, 800 |
| Offstage Director | 19095 | 498, 499 |
| Host Core Cap | 19096 | 524 |
| Security Lead | 19144 | 748 |

- Multi-slot roles merge into one cell for display (slot order, empty slots contribute nothing) and write back positionally. More names than slots → reject the whole write with a message naming the limit. Never truncate.
- **Linkage is per role, not per runsheet.** A role is linked only when its own Location actually carries the matched Schedule in Rock (`GroupLocationSchedule`). Group 19096 (Host) and 19144 (Security) do not carry `MNL Family Night`, so on that runsheet Host Core Cap and Security Lead are **unlinked** and behave exactly as they did before this feature: free text, `PeopleSearchDropdown`, stored `Roster:` value, no write-back. The rest of the card is still linked. For a multi-slot role, only the slots that carry the schedule count — a role with one of its two slots available is linked with one slot.
- A linked role with nobody rostered is still **linked**: it shows empty and is editable through the Rock picker. Empty is not the same as unlinked.
- Rostered = RSVP **Yes (2)** or **Unknown (0)**. Declined (**1**) is excluded. (Matches roster *access* behaviour since 1.18.1.)
- New assignments are created **confirmed (RSVP Yes)**. Removals **unschedule** (remove the assignment). A person present before and after the edit is left completely untouched.
- Only the edited role is ever written. The other nine are never touched by a write.
- Never write to a runsheet whose date is in the past.
- Write requires `canUserEditRunsheet(session)` plus the existing channel authorization.
- Read is refresh-driven: React Query `staleTime: 0`, `refetchOnWindowFocus: false`, no polling.
- Fail-soft on read (fall back to stored `Roster:` values plus a note), fail-closed on write (revert the cell, show the error, leave Rock and the runsheet item alone).
- Person IDs are **not** persisted in the runsheet item. The cell text stays a plain display string; IDs live in picker state for the duration of one edit and come back from Rock on the next read.
- Versioning (semver): **1.19.0 → 1.20.0**.
- Run tests with `pnpm test -- <path>`, and finish with `pnpm test && pnpm typecheck && pnpm lint`.
- End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Map

| File | Change |
|---|---|
| `src/lib/rockRosterRoles.ts` (new, + test) | Pure: role → `{ groupId, locationIds }` mapping and lookups |
| `src/lib/rockServiceSchedule.ts` (new, + test) | Pure: channel name → `{ isoDate, schedulePrefix, timeSignature }` and schedule matching |
| `src/lib/rockRosterSlots.ts` (new, + test) | Pure: current-vs-desired slot diff → adds / removes / overflow error |
| `src/server-actions/internal/rockFetch.ts` | Add `PUT` to the method union and a `rockPut` wrapper |
| `src/server-actions/rockGetRosterAssignments.ts` (new, + test) | Read Rock roster for a channel |
| `src/server-actions/rockSyncRosterRole.ts` (new, + test) | Write one role back to Rock |
| `src/components/runsheet/runsheetQueries.ts` | `useRosterAssignments` query key + hook |
| `src/components/runsheet/RockRosterRolePicker.tsx` (new) | Rock-search-only picker for linked roles |
| `src/components/runsheet/EventTeamRosterCard.tsx` | Render Rock values, link badge, read-failure note |
| `src/components/runsheet/RunsheetTableEditor.tsx` | Wire the hook, swap the picker for linked roles, mirror into `Roster:` items |
| `src/lib/runsheetDate.ts` (+ test) | Sort direction on `compareRunsheetChannels` / `sortRunsheetChannels` |
| `src/components/runsheet/RunsheetLandingView.tsx` | Partition upcoming (asc) / past (desc) |
| `package.json` | 1.20.0 |

---

### Task 0: Prove the Rock scheduler write actions are callable (spike — no product code)

This gates Tasks 4, 6 and 8. On this Rock instance the eight Group Scheduler write REST actions
once had **zero `Auth` rows for any principal**, so they 401 silently for everyone (learning
`2026-07-24-scheduler-write-actions-had-no-auth-rows-for-anyone.md`). Do not build the write path
on an assumption.

**Files:**
- Create: nothing in `src/`. Record findings in this plan file under "Task 0 findings".

- [x] **Step 1: List the Attendances scheduler REST actions and their Auth rows**

Using the `rock-favor:rock-ssh` skill against **`rock-preview`** (never prod for a probe), run:

```sql
SELECT ra.Id, ra.Method, ra.ApiId
FROM   RestAction ra
JOIN   RestController rc ON rc.Id = ra.ControllerId
WHERE  rc.ClassName LIKE '%AttendancesController%'
ORDER  BY ra.Method, ra.ApiId;

SELECT a.EntityTypeId, a.EntityId, a.Action, a.AllowOrDeny, a.SpecialRole, a.GroupId, a.PersonAliasId
FROM   Auth a
JOIN   EntityType et ON et.Id = a.EntityTypeId AND et.Name = 'Rock.Model.RestAction'
WHERE  a.EntityId IN (
         SELECT ra.Id FROM RestAction ra
         JOIN RestController rc ON rc.Id = ra.ControllerId
         WHERE rc.ClassName LIKE '%AttendancesController%'
       );
```

- [x] **Step 2: Confirm the exact signatures of the two actions this feature needs**

From the `ApiId` column, record the verb and querystring for:
- `ScheduledPersonAddConfirmed` — expected `PUT /api/Attendances/ScheduledPersonAddConfirmed?personId={personId}&attendanceOccurrenceId={attendanceOccurrenceId}`
- `ScheduledPersonRemove` — expected `PUT /api/Attendances/ScheduledPersonRemove?attendanceId={attendanceId}`

If the real signatures differ (extra required `scheduledByPersonAliasId`, different verb), record
the real ones — Task 6 must use what is actually there.

- [x] **Step 3: Confirm the app's API identity can call them**

Using the preview `ROCK_API_KEY`, add then remove one assignment for a throwaway person on a
future preview occurrence. A `401` means the app identity has no `Auth` row on that RestAction.

- [x] **Step 4: Write the findings into this file**

Append a "## Task 0 findings" section recording: exact endpoint signatures, whether the app
identity is authorised on prod and on preview, and (if not) what Auth row must be added and by
whom.

- [x] **Step 5: Stop and report if unauthorised**

If the app identity cannot call these actions, **stop**. Tasks 1, 2, 3, 5, 7 and 9 (read path,
pure logic, archive sort) are still safe to build and ship; Tasks 4, 6 and 8 are blocked until the
Auth rows exist. Report this rather than working around it with raw `Attendance` POSTs.

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-09-28-rock-linked-event-team-roster.md
git commit -m "docs: record Rock scheduler REST write-action findings"
```

---

### Task 1: Role → group/location mapping

**Files:**
- Create: `src/lib/rockRosterRoles.ts`
- Test: `src/lib/rockRosterRoles.test.ts`

**Interfaces:**
- Consumes: `VITAL_ROLES` (exported from `src/components/runsheet/EventTeamRosterCard.tsx`) — for the type only; do **not** import the component into a lib module. Redeclare the role names here as the source of truth for mapping and assert in test that they match.
- Produces:
  - `type RockRosterRole = { roleTitle: string; groupId: number; locationIds: number[] }`
  - `ROCK_ROSTER_ROLES: readonly RockRosterRole[]`
  - `getRockRosterRole(roleTitle: string): RockRosterRole | null`
  - `ROCK_ROSTER_GROUP_IDS: readonly number[]`
  - `isRockLinkedCampus(channelName: string): boolean`
  - `usableRoleLocationIds(role: RockRosterRole, scheduleIdsByLocation: Map<number, Set<number>>, scheduleId: number): number[]`

`roleTitle` is the full runsheet item title, e.g. `'Roster: Service Director'` — that is what the
card and the editor pass around.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { VITAL_ROLES } from '@/components/runsheet/EventTeamRosterCard';
import {
  getRockRosterRole,
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  ROCK_ROSTER_ROLES,
  usableRoleLocationIds,
} from './rockRosterRoles';

describe('ROCK_ROSTER_ROLES', () => {
  it('maps every vital role exactly once', () => {
    expect(ROCK_ROSTER_ROLES.map((r) => r.roleTitle).sort()).toEqual(
      VITAL_ROLES.map((r) => `Roster: ${r}`).sort(),
    );
  });

  it('lists the five Group Scheduler groups', () => {
    expect([...ROCK_ROSTER_GROUP_IDS].sort()).toEqual([19095, 19096, 19100, 19109, 19144]);
  });

  it('never reuses a locationId across roles', () => {
    const all = ROCK_ROSTER_ROLES.flatMap((r) => r.locationIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('getRockRosterRole', () => {
  it('resolves a single-slot role', () => {
    expect(getRockRosterRole('Roster: Service Director')).toEqual({
      roleTitle: 'Roster: Service Director',
      groupId: 19100,
      locationIds: [475],
    });
  });

  it('keeps multi-slot fill order', () => {
    expect(getRockRosterRole('Roster: Worship Leaders')?.locationIds).toEqual([799, 800]);
    expect(getRockRosterRole('Roster: Offstage Director')?.locationIds).toEqual([498, 499]);
  });

  it('returns null for an unmapped title', () => {
    expect(getRockRosterRole('Roster: Coffee Captain')).toBeNull();
    expect(getRockRosterRole('Welcome')).toBeNull();
  });
});

describe('isRockLinkedCampus', () => {
  it('accepts MNL and rejects everything else', () => {
    expect(isRockLinkedCampus('MNL Crowne // September 27, 2026 // 3PM')).toBe(true);
    expect(isRockLinkedCampus('BNE Service // September 27, 2026 // 10AM')).toBe(false);
    expect(isRockLinkedCampus('SEL Service // September 27, 2026 // 10AM')).toBe(false);
  });
});

describe('usableRoleLocationIds', () => {
  const worshipLeaders = getRockRosterRole('Roster: Worship Leaders')!;
  const securityLead = getRockRosterRole('Roster: Security Lead')!;

  it('keeps the slots whose location carries the schedule', () => {
    const byLocation = new Map([
      [799, new Set([35, 565])],
      [800, new Set([35, 565])],
    ]);
    expect(usableRoleLocationIds(worshipLeaders, byLocation, 565)).toEqual([799, 800]);
  });

  it('drops a slot whose location does not carry the schedule, keeping fill order', () => {
    const byLocation = new Map([
      [799, new Set([565])],
      [800, new Set([27])],
    ]);
    expect(usableRoleLocationIds(worshipLeaders, byLocation, 565)).toEqual([799]);
  });

  it('returns nothing for a role Rock does not schedule for this service', () => {
    // Security (748) carries no MNL Family Night (35) schedule in Rock.
    const byLocation = new Map([[748, new Set([27, 565])]]);
    expect(usableRoleLocationIds(securityLead, byLocation, 35)).toEqual([]);
  });

  it('returns nothing when the location is absent entirely', () => {
    expect(usableRoleLocationIds(securityLead, new Map(), 565)).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/rockRosterRoles.test.ts`
Expected: FAIL — `Cannot find module './rockRosterRoles'`

- [x] **Step 3: Write minimal implementation**

```ts
/**
 * Maps the runsheet's vital roster roles onto Rock Group Scheduler.
 *
 * In Group Scheduler a *role* is a `Location` attached to the team `Group`, so a
 * role maps to one groupId plus one or more locationIds. Multi-slot roles
 * (Worship Leaders, Offstage Director) merge into one runsheet cell for display
 * and fill their slots positionally on write.
 *
 * Verified against production Rock on 2026-09-28. MNL only by decision; adding a
 * campus is adding rows here, not changing code.
 */
import { extractRunsheetCampus } from './runsheetCampus';

export interface RockRosterRole {
  /** Full runsheet item title, e.g. `Roster: Service Director`. */
  roleTitle: string;
  groupId: number;
  /** Rock Location ids, in the order names fill them. */
  locationIds: number[];
}

export const ROCK_ROSTER_ROLES: readonly RockRosterRole[] = [
  { roleTitle: 'Roster: Service Director', groupId: 19100, locationIds: [475] },
  { roleTitle: 'Roster: Service Producer', groupId: 19109, locationIds: [661] },
  { roleTitle: 'Roster: Assistant Service Producers', groupId: 19109, locationIds: [662] },
  { roleTitle: 'Roster: Stage Manager Captain', groupId: 19100, locationIds: [479] },
  { roleTitle: 'Roster: Assistant Stage Managers', groupId: 19100, locationIds: [480] },
  { roleTitle: 'Roster: Music Director', groupId: 19095, locationIds: [794] },
  { roleTitle: 'Roster: Offstage Director', groupId: 19095, locationIds: [498, 499] },
  { roleTitle: 'Roster: Worship Leaders', groupId: 19095, locationIds: [799, 800] },
  { roleTitle: 'Roster: Host Core Cap', groupId: 19096, locationIds: [524] },
  { roleTitle: 'Roster: Security Lead', groupId: 19144, locationIds: [748] },
] as const;

export const ROCK_ROSTER_GROUP_IDS: readonly number[] = [
  ...new Set(ROCK_ROSTER_ROLES.map((r) => r.groupId)),
];

export function getRockRosterRole(roleTitle: string): RockRosterRole | null {
  return ROCK_ROSTER_ROLES.find((r) => r.roleTitle === roleTitle) ?? null;
}

/** Rock-linked rostering is MNL-only for now. */
export function isRockLinkedCampus(channelName: string): boolean {
  return extractRunsheetCampus(channelName) === 'MNL';
}

/**
 * The slots this role actually has for one service, in fill order.
 *
 * Not every team schedules every service: group 19096 (Host) and 19144
 * (Security) carry no `MNL Family Night` schedule, so on that runsheet those
 * roles have no slot at all. An empty result means the role is **unlinked** for
 * this service and must behave exactly as it did before this feature — free
 * text, stored value, no write-back.
 *
 * @param scheduleIdsByLocation Rock `Location` id → the Schedule ids attached to it.
 */
export function usableRoleLocationIds(
  role: RockRosterRole,
  scheduleIdsByLocation: Map<number, Set<number>>,
  scheduleId: number,
): number[] {
  return role.locationIds.filter((id) => scheduleIdsByLocation.get(id)?.has(scheduleId));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/rockRosterRoles.test.ts`
Expected: PASS

If the first test fails because `VITAL_ROLES` and the table disagree, the table is wrong — fix the
table, not the test.

- [x] **Step 5: Commit**

```bash
git add src/lib/rockRosterRoles.ts src/lib/rockRosterRoles.test.ts
git commit -m "feat: map vital roster roles to Rock Group Scheduler groups and locations"
```

---

### Task 2: Channel name → Rock schedule resolution

**Files:**
- Create: `src/lib/rockServiceSchedule.ts`
- Test: `src/lib/rockServiceSchedule.test.ts`

**Interfaces:**
- Consumes: `extractChannelDate`, `extractChannelTime`, `extractChannelTitleDisplay`, `parseTimeToSortSignature` from `./runsheetDate`; `isRockLinkedCampus` from `./rockRosterRoles`.
- Produces:
  - `interface RockServiceCandidate { scheduleId: number; name: string }`
  - `interface RockServiceOccurrence { scheduleId: number; isoDate: string }`
  - `parseChannelOccurrence(channelName: string): { isoDate: string; prefix: string; timeSignature: string } | null`
  - `matchRockSchedule(channelName: string, services: RockServiceCandidate[]): RockServiceOccurrence | null`

Real channel names look like `MNL Crowne // September 27, 2026 // 3PM`. Real schedule names look
like `MNL Crowne 3PM`, `MNL Podium 5:30PM`, `MNL Filoil 3PM`, `MNL Family Night`.

Matching rules, in order, requiring **exactly one** surviving candidate:
1. Normalised prefix equal **and** time signature equal (`MNL Crowne` + `15:00:00` → `MNL Crowne 3PM`).
2. Normalised whole channel prefix equal to the whole schedule name, for time-less schedules (`MNL Family Night`).

Anything else — no match, several matches, non-MNL, unparseable date — returns `null`, and the
runsheet is unlinked.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { matchRockSchedule, parseChannelOccurrence } from './rockServiceSchedule';

const SERVICES = [
  { scheduleId: 27, name: 'MNL Crowne 10AM' },
  { scheduleId: 35, name: 'MNL Family Night' },
  { scheduleId: 491, name: 'MNL Podium 5:30PM' },
  { scheduleId: 565, name: 'MNL Crowne 3PM' },
  { scheduleId: 666, name: 'MNL Filoil 3PM' },
];

describe('parseChannelOccurrence', () => {
  it('splits a channel name into date, prefix and time signature', () => {
    expect(parseChannelOccurrence('MNL Crowne // September 27, 2026 // 3PM')).toEqual({
      isoDate: '2026-09-27',
      prefix: 'MNL Crowne',
      timeSignature: '15:00:00',
    });
  });

  it('returns null for a non-MNL channel', () => {
    expect(parseChannelOccurrence('BNE Service // September 27, 2026 // 10AM')).toBeNull();
  });

  it('returns null when the date cannot be parsed', () => {
    expect(parseChannelOccurrence('MNL Crowne // sometime // 3PM')).toBeNull();
  });
});

describe('matchRockSchedule', () => {
  it('matches on venue prefix plus time signature', () => {
    expect(matchRockSchedule('MNL Crowne // September 27, 2026 // 3PM', SERVICES)).toEqual({
      scheduleId: 565,
      isoDate: '2026-09-27',
    });
  });

  it('tolerates a different but equivalent time spelling', () => {
    expect(matchRockSchedule('MNL Podium // September 27, 2026 // 5:30 PM', SERVICES)?.scheduleId).toBe(491);
  });

  it('matches a time-less schedule by full prefix', () => {
    expect(matchRockSchedule('MNL Family Night // September 30, 2026 // 7PM', SERVICES)).toEqual({
      scheduleId: 35,
      isoDate: '2026-09-30',
    });
  });

  it('returns null when nothing matches', () => {
    expect(matchRockSchedule('MNL Shang // September 27, 2026 // 3PM', SERVICES)).toBeNull();
  });

  it('returns null when two schedules match ambiguously', () => {
    const ambiguous = [
      { scheduleId: 1, name: 'MNL Crowne 3PM' },
      { scheduleId: 2, name: 'MNL Crowne 3:00PM' },
    ];
    expect(matchRockSchedule('MNL Crowne // September 27, 2026 // 3PM', ambiguous)).toBeNull();
  });

  it('returns null for a non-MNL channel even when a name would match', () => {
    expect(matchRockSchedule('BNE Crowne // September 27, 2026 // 3PM', SERVICES)).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/rockServiceSchedule.test.ts`
Expected: FAIL — `Cannot find module './rockServiceSchedule'`

- [x] **Step 3: Write minimal implementation**

```ts
/**
 * Resolves a runsheet channel name to one Rock `Schedule` plus an occurrence date.
 *
 * Channel: `MNL Crowne // September 27, 2026 // 3PM`
 * Schedule: `MNL Crowne 3PM` (id 565)
 *
 * A channel resolves only when exactly one schedule matches. No match, several
 * matches, or a non-MNL campus all mean "unlinked", and the roster card falls
 * back to its free-text behaviour.
 */
import { isRockLinkedCampus } from './rockRosterRoles';
import {
  extractChannelDate,
  extractChannelTime,
  extractChannelTitleDisplay,
  parseTimeToSortSignature,
} from './runsheetDate';

export interface RockServiceCandidate {
  scheduleId: number;
  name: string;
}

export interface RockServiceOccurrence {
  scheduleId: number;
  /** `YYYY-MM-DD`, local to the campus. */
  isoDate: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Splits `MNL Crowne // September 27, 2026 // 3PM` into its matchable parts. */
export function parseChannelOccurrence(
  channelName: string,
): { isoDate: string; prefix: string; timeSignature: string } | null {
  if (!isRockLinkedCampus(channelName)) return null;
  const date = extractChannelDate(channelName);
  if (!date || isNaN(date.getTime())) return null;
  const prefix = extractChannelTitleDisplay(channelName).trim();
  if (!prefix) return null;
  return {
    isoDate: toIsoLocal(date),
    prefix,
    timeSignature: parseTimeToSortSignature(extractChannelTime(channelName)),
  };
}

/** Splits `MNL Podium 5:30PM` into `{ prefix: 'MNL Podium', timeSignature: '17:30:00' }`. */
function parseScheduleName(name: string): { prefix: string; timeSignature: string } {
  const m = name.trim().match(/^(.*?)[\s|-]+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))$/i);
  if (!m) return { prefix: name.trim(), timeSignature: '' };
  return { prefix: m[1].trim(), timeSignature: parseTimeToSortSignature(m[2].trim()) };
}

export function matchRockSchedule(
  channelName: string,
  services: RockServiceCandidate[],
): RockServiceOccurrence | null {
  const channel = parseChannelOccurrence(channelName);
  if (!channel) return null;

  const channelPrefix = normalize(channel.prefix);
  const parsed = services.map((s) => ({ service: s, ...parseScheduleName(s.name) }));

  let matches = channel.timeSignature
    ? parsed.filter(
        (p) => normalize(p.prefix) === channelPrefix && p.timeSignature === channel.timeSignature,
      )
    : [];

  if (matches.length === 0) {
    // Time-less schedules such as `MNL Family Night`, whose whole name is the
    // channel's own prefix.
    matches = parsed.filter((p) => !p.timeSignature && normalize(p.service.name) === channelPrefix);
  }

  if (matches.length !== 1) return null;
  return { scheduleId: matches[0].service.scheduleId, isoDate: channel.isoDate };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/rockServiceSchedule.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/rockServiceSchedule.ts src/lib/rockServiceSchedule.test.ts
git commit -m "feat: resolve runsheet channel names to Rock service schedules"
```

---

### Task 3: Slot-fill diff

**Files:**
- Create: `src/lib/rockRosterSlots.ts`
- Test: `src/lib/rockRosterSlots.test.ts`

**Interfaces:**
- Consumes: nothing. Pure.
- Produces:
  - `interface RosterOccupant { attendanceId: number; personId: number; name: string; locationId: number }`
  - `interface RosterSlotPlan { adds: { personId: number; locationId: number }[]; removes: number[]; error: string | null }`
  - `mergeRosterOccupants(occupants: RosterOccupant[], locationIds: number[]): RosterOccupant[]`
  - `planRosterSlots(occupants: RosterOccupant[], desiredPersonIds: number[], locationIds: number[]): RosterSlotPlan`

`mergeRosterOccupants` is the display order: occupants sorted by their location's position in
`locationIds`, stable within a location. `planRosterSlots` is the write: `removes` are
`attendanceId`s, `adds` are person+slot pairs, and a person who is already in the role keeps their
existing assignment and appears in neither list.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { mergeRosterOccupants, planRosterSlots } from './rockRosterSlots';

const WL = [799, 800];
const occ = (attendanceId: number, personId: number, name: string, locationId: number) => ({
  attendanceId, personId, name, locationId,
});

describe('mergeRosterOccupants', () => {
  it('orders occupants by slot order, not by arrival order', () => {
    const merged = mergeRosterOccupants(
      [occ(2, 20, 'Second Slot', 800), occ(1, 10, 'First Slot', 799)],
      WL,
    );
    expect(merged.map((o) => o.name)).toEqual(['First Slot', 'Second Slot']);
  });

  it('skips occupants in unmapped locations', () => {
    const merged = mergeRosterOccupants([occ(3, 30, 'Stray', 555)], WL);
    expect(merged).toEqual([]);
  });

  it('handles a half-filled multi-slot role', () => {
    expect(mergeRosterOccupants([occ(2, 20, 'Only One', 800)], WL).map((o) => o.name)).toEqual([
      'Only One',
    ]);
  });
});

describe('planRosterSlots', () => {
  it('adds a person into the first free slot', () => {
    expect(planRosterSlots([], [10], WL)).toEqual({
      adds: [{ personId: 10, locationId: 799 }],
      removes: [],
      error: null,
    });
  });

  it('leaves an unchanged person completely alone', () => {
    expect(planRosterSlots([occ(1, 10, 'Stays', 799)], [10], WL)).toEqual({
      adds: [],
      removes: [],
      error: null,
    });
  });

  it('removes a person dropped from the cell', () => {
    expect(planRosterSlots([occ(1, 10, 'Goes', 799)], [], WL)).toEqual({
      adds: [],
      removes: [1],
      error: null,
    });
  });

  it('fills the second slot without disturbing the first', () => {
    expect(planRosterSlots([occ(1, 10, 'Stays', 799)], [10, 20], WL)).toEqual({
      adds: [{ personId: 20, locationId: 800 }],
      removes: [],
      error: null,
    });
  });

  it('swaps one person for another in a single-slot role', () => {
    expect(planRosterSlots([occ(1, 10, 'Out', 475)], [99], [475])).toEqual({
      adds: [{ personId: 99, locationId: 475 }],
      removes: [1],
      error: null,
    });
  });

  it('rejects more names than the role has slots and plans nothing', () => {
    const plan = planRosterSlots([], [10, 20, 30], WL);
    expect(plan.adds).toEqual([]);
    expect(plan.removes).toEqual([]);
    expect(plan.error).toBe('Rock only has 2 slots for this role, but 3 people were assigned.');
  });

  it('rejects the same person listed twice', () => {
    const plan = planRosterSlots([], [10, 10], WL);
    expect(plan.adds).toEqual([]);
    expect(plan.error).toBe('The same person cannot be assigned to this role twice.');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/rockRosterSlots.test.ts`
Expected: FAIL — `Cannot find module './rockRosterSlots'`

- [x] **Step 3: Write minimal implementation**

```ts
/**
 * Diffs a role's current Rock occupants against the people the runsheet now
 * wants in it.
 *
 * A role owns an ordered list of Rock Locations ("slots"). Names fill slots
 * positionally. Someone present before and after an edit keeps their existing
 * assignment and its RSVP state — an unrelated edit to the same cell must never
 * churn a confirmed volunteer into a fresh record.
 */

export interface RosterOccupant {
  attendanceId: number;
  personId: number;
  name: string;
  locationId: number;
}

export interface RosterSlotPlan {
  adds: { personId: number; locationId: number }[];
  /** Attendance ids to unschedule. */
  removes: number[];
  /** Non-null means the whole write is rejected and nothing is applied. */
  error: string | null;
}

/** Display order: by slot position, stable within a slot. */
export function mergeRosterOccupants(
  occupants: RosterOccupant[],
  locationIds: number[],
): RosterOccupant[] {
  return occupants
    .filter((o) => locationIds.includes(o.locationId))
    .map((o, index) => ({ o, index }))
    .sort((a, b) => {
      const slot = locationIds.indexOf(a.o.locationId) - locationIds.indexOf(b.o.locationId);
      return slot !== 0 ? slot : a.index - b.index;
    })
    .map((entry) => entry.o);
}

export function planRosterSlots(
  occupants: RosterOccupant[],
  desiredPersonIds: number[],
  locationIds: number[],
): RosterSlotPlan {
  const empty: RosterSlotPlan = { adds: [], removes: [], error: null };

  if (new Set(desiredPersonIds).size !== desiredPersonIds.length) {
    return { ...empty, error: 'The same person cannot be assigned to this role twice.' };
  }
  if (desiredPersonIds.length > locationIds.length) {
    return {
      ...empty,
      error: `Rock only has ${locationIds.length} slot${
        locationIds.length === 1 ? '' : 's'
      } for this role, but ${desiredPersonIds.length} people were assigned.`,
    };
  }

  const current = mergeRosterOccupants(occupants, locationIds);
  const keptPersonIds = new Set(
    desiredPersonIds.filter((id) => current.some((o) => o.personId === id)),
  );

  const removes = current.filter((o) => !keptPersonIds.has(o.personId)).map((o) => o.attendanceId);

  // Slots held by someone who is staying are not available to newcomers.
  const takenSlots = new Set(
    current.filter((o) => keptPersonIds.has(o.personId)).map((o) => o.locationId),
  );
  const freeSlots = locationIds.filter((id) => !takenSlots.has(id));

  const adds = desiredPersonIds
    .filter((id) => !keptPersonIds.has(id))
    .map((personId, index) => ({ personId, locationId: freeSlots[index] }));

  return { adds, removes, error: null };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/rockRosterSlots.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/rockRosterSlots.ts src/lib/rockRosterSlots.test.ts
git commit -m "feat: plan roster slot adds and removes for a Rock-linked role"
```

---

### Task 4: `PUT` support in `rockFetch`

Blocked by Task 0. Rock's Group Scheduler write actions are `PUT`, and `rockFetch` currently
handles only `GET`/`POST`/`PATCH`/`DELETE`.

**Files:**
- Modify: `src/server-actions/internal/rockFetch.ts` (the `method` union at ~line 45, the body/cache branch at ~line 92, and the wrappers at the end of the file)
- Test: `src/server-actions/internal/rockFetch.put.test.ts`

**Interfaces:**
- Produces: `rockPut(url: string, params?: RockQueryParams, body?: any): Promise<any>`

Rock's scheduler actions take their arguments in the querystring and no body, which is why `body`
is optional and second here.

- [x] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({
  assertAuthenticated: jest.fn(async () => undefined),
}));
jest.mock('@/server-actions/internal/rockObjectCache', () => ({
  readRockObjectCache: jest.fn(async () => ({ hit: false })),
  writeRockObjectCache: jest.fn(async () => undefined),
  bustRockObjectCache: jest.fn(async () => undefined),
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

import { rockPut } from './rockFetch';

describe('rockPut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response('', { status: 200 })) as any;
  });

  it('issues a PUT with the params in the querystring and no caching', async () => {
    await rockPut('/Attendances/ScheduledPersonRemove', { attendanceId: 42 });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/Attendances/ScheduledPersonRemove?attendanceId=42');
    expect(options.method).toBe('PUT');
    expect(options.cache).toBe('no-store');
  });

  it('throws on a non-OK response so callers can fail closed', async () => {
    global.fetch = jest.fn(async () => new Response('denied', { status: 401 })) as any;
    await expect(rockPut('/Attendances/ScheduledPersonRemove', { attendanceId: 42 })).rejects.toThrow(
      /401/,
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/server-actions/internal/rockFetch.put.test.ts`
Expected: FAIL — `rockPut is not a function`

- [x] **Step 3: Write minimal implementation**

In `rockFetch.ts`, widen the method union:

```ts
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
```

extend the write branch so a `PUT` body is serialized and `PUT` is always uncached:

```ts
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    fetchOptions.body = JSON.stringify(body);
    fetchOptions.cache = 'no-store';
  } else if (method === 'DELETE' || method === 'PUT' || noCache) {
    fetchOptions.cache = 'no-store';
  } else {
```

and add the wrapper beside the others:

```ts
/**
 * Uncached PUT. Rock's Group Scheduler write actions
 * (`ScheduledPersonAddConfirmed`, `ScheduledPersonRemove`) are PUTs that take
 * their arguments in the querystring, hence `params` before `body`.
 */
export const rockPut = (url: string, params?: RockQueryParams, body?: any) =>
  rockFetch(url, 'PUT', params, body, true);
```

The existing cache-busting branch is `method !== 'GET'`, so a `PUT` already busts the Redis object
cache and revalidates the tag. No change needed there.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/server-actions/internal/rockFetch.put.test.ts && pnpm test -- src/server-actions`
Expected: PASS, and no existing `rockFetch` consumer regresses.

- [x] **Step 5: Commit**

```bash
git add src/server-actions/internal/rockFetch.ts src/server-actions/internal/rockFetch.put.test.ts
git commit -m "feat: support PUT in rockFetch for Rock scheduler write actions"
```

---

### Task 5: `rockGetRosterAssignments` read action

**Files:**
- Create: `src/server-actions/rockGetRosterAssignments.ts`
- Test: `src/server-actions/rockGetRosterAssignments.test.ts`

**Interfaces:**
- Consumes: `getRockSession`, `assertRunsheetViewAccess` (from `./runsheetAuthorization`), `rockGet`, `ROCK_ROSTER_ROLES`, `ROCK_ROSTER_GROUP_IDS`, `getRockRosterRole`, `matchRockSchedule`, `mergeRosterOccupants`, `RosterOccupant`.
- Produces:

```ts
export interface RosterRoleAssignment {
  roleTitle: string;
  people: { personId: number; name: string }[];
}

export interface RockRosterAssignmentsResult {
  success: boolean;
  /** false = this runsheet has no Rock occurrence; the card stays free-text. */
  linked: boolean;
  scheduleId: number | null;
  isoDate: string | null;
  roles: RosterRoleAssignment[];
  error?: string;
}

export async function rockGetRosterAssignments(
  channelName: string,
): Promise<RockRosterAssignmentsResult>;
```

Rock calls, in order:
1. `GET /GroupLocations?$filter=GroupId eq {id}&$expand=Schedules,Location` per group, which
   yields both the group's services and which schedules hang off each location, in one pass.
   Cache-friendly (`rockGet` default caching is fine; these change rarely).
2. `matchRockSchedule` against the union of those services → `{ scheduleId, isoDate }` or unlinked.
3. `usableRoleLocationIds` per role against the same data. **A role with no usable slot is left
   out of `roles` entirely**, which is what makes the card fall back to its pre-feature behaviour
   for that one role.
4. `GET /AttendanceOccurrences` filtered to the usable groups/locations and that schedule+date,
   `$select=Id,GroupId,LocationId`.
5. `GET /Attendances` for those occurrence ids with `$expand=PersonAlias/Person`,
   `$select=Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName`.

Filter to `RSVP` 0 (Unknown/pending) or 2 (Yes/confirmed); exclude 1 (No/declined). Display name is
`NickName LastName`.

A role that is linked but empty still appears in `roles`, with `people: []`. Present-and-empty and
absent mean different things to the card, and the difference is the whole point of this task.

- [x] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetRosterAssignments } from './rockGetRosterAssignments';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const SESSION = {
  rolesMap: { editor: ['7001'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

/** Group locations + services, as `/GroupLocations?$expand=Schedules,Location` returns them. */
function groupLocations() {
  return [
    {
      GroupId: 19100,
      LocationId: 475,
      Location: { Id: 475, Name: 'Service Director' },
      Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }],
    },
  ];
}

describe('rockGetRosterAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue(SESSION);
  });

  it('reports unlinked for a non-MNL runsheet without calling Rock', async () => {
    const res = await rockGetRosterAssignments('BNE Service // September 27, 2026 // 10AM');
    expect(res).toMatchObject({ success: true, linked: false, roles: [] });
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('returns confirmed and pending people, excluding declines', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([] as any) // 19144
      .mockResolvedValueOnce([{ Id: 900, GroupId: 19100, LocationId: 475 }] as any)
      .mockResolvedValueOnce([
        {
          Id: 1,
          OccurrenceId: 900,
          RSVP: 2,
          PersonAlias: { PersonId: 10, Person: { NickName: 'Juan', LastName: 'Dela Cruz' } },
        },
        {
          Id: 2,
          OccurrenceId: 900,
          RSVP: 1,
          PersonAlias: { PersonId: 20, Person: { NickName: 'Declined', LastName: 'Person' } },
        },
      ] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(res.linked).toBe(true);
    expect(res.scheduleId).toBe(565);
    expect(res.isoDate).toBe('2026-09-27');
    expect(res.roles.find((r) => r.roleTitle === 'Roster: Service Director')?.people).toEqual([
      { personId: 10, name: 'Juan Dela Cruz' },
    ]);
  });

  it('omits roles whose location does not carry this schedule', async () => {
    // Only Service Director (475) is attached to schedule 565 here, so the other
    // nine roles must not appear at all — the card falls back to free text for them.
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any) // no occurrences
      .mockResolvedValueOnce([] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(res.roles.map((r) => r.roleTitle)).toEqual(['Roster: Service Director']);
  });

  it('keeps a linked role that simply has nobody rostered', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    // Present with an empty list — linked but unfilled, not unlinked.
    expect(res.roles).toEqual([{ roleTitle: 'Roster: Service Director', people: [] }]);
  });

  it('fails soft when Rock throws', async () => {
    mockRockGet.mockRejectedValue(new Error('Rock API error: 500'));
    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');
    expect(res.success).toBe(false);
    expect(res.roles).toEqual([]);
    expect(res.error).toBe('Could not read the roster from Rock.');
  });

  it('denies a session with no runsheet view access', async () => {
    mockSession.mockResolvedValueOnce({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);
    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');
    expect(res.success).toBe(false);
    expect(mockRockGet).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/server-actions/rockGetRosterAssignments.test.ts`
Expected: FAIL — `Cannot find module './rockGetRosterAssignments'`

- [x] **Step 3: Write minimal implementation**

```ts
'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  ROCK_ROSTER_ROLES,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { mergeRosterOccupants, type RosterOccupant } from '@/lib/rockRosterSlots';
import { matchRockSchedule, type RockServiceCandidate } from '@/lib/rockServiceSchedule';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

/** Rock `Attendance.RSVP`: 0 Unknown (pending), 1 No (declined), 2 Yes (confirmed). */
const ROSTERED_RSVP = new Set([0, 2]);

export interface RosterRoleAssignment {
  roleTitle: string;
  people: { personId: number; name: string }[];
}

export interface RockRosterAssignmentsResult {
  success: boolean;
  linked: boolean;
  scheduleId: number | null;
  isoDate: string | null;
  roles: RosterRoleAssignment[];
  error?: string;
}

const UNLINKED: RockRosterAssignmentsResult = {
  success: true,
  linked: false,
  scheduleId: null,
  isoDate: null,
  roles: [],
};

export async function rockGetRosterAssignments(
  channelName: string,
): Promise<RockRosterAssignmentsResult> {
  if (!isRockLinkedCampus(channelName)) return UNLINKED;

  const session = await getRockSession();
  const access = assertRunsheetViewAccess(session);
  if (!access.allowed) {
    return { ...UNLINKED, success: false, error: access.error };
  }

  try {
    // One pass per group gives both its services and its locations.
    const perGroup = await Promise.all(
      ROCK_ROSTER_GROUP_IDS.map((groupId) =>
        rockGet('/GroupLocations', {
          $filter: `GroupId eq ${groupId}`,
          $expand: 'Schedules,Location',
        }) as Promise<any[] | null>,
      ),
    );

    const services = new Map<number, RockServiceCandidate>();
    const scheduleIdsByLocation = new Map<number, Set<number>>();
    for (const rows of perGroup) {
      for (const row of rows || []) {
        const locationId = row.LocationId ?? row.Location?.Id;
        for (const schedule of row.Schedules || []) {
          if (!schedule?.Id) continue;
          services.set(schedule.Id, { scheduleId: schedule.Id, name: schedule.Name });
          if (locationId === undefined) continue;
          const set = scheduleIdsByLocation.get(locationId) ?? new Set<number>();
          set.add(schedule.Id);
          scheduleIdsByLocation.set(locationId, set);
        }
      }
    }

    const occurrence = matchRockSchedule(channelName, [...services.values()]);
    if (!occurrence) return UNLINKED;

    // A role Rock does not schedule for this service has no slot to read or
    // write, so it is dropped here and the card falls back to free text for it.
    const linkedRoles = ROCK_ROSTER_ROLES.map((role) => ({
      role,
      locationIds: usableRoleLocationIds(role, scheduleIdsByLocation, occurrence.scheduleId),
    })).filter((entry) => entry.locationIds.length > 0);

    if (linkedRoles.length === 0) return UNLINKED;

    const locationIds = linkedRoles.flatMap((entry) => entry.locationIds);
    const occurrences = ((await rockGet('/AttendanceOccurrences', {
      $filter: [
        `ScheduleId eq ${occurrence.scheduleId}`,
        `OccurrenceDate eq datetime'${occurrence.isoDate}T00:00:00'`,
        `(${ROCK_ROSTER_GROUP_IDS.map((id) => `GroupId eq ${id}`).join(' or ')})`,
        `(${locationIds.map((id) => `LocationId eq ${id}`).join(' or ')})`,
      ].join(' and '),
      $select: 'Id,GroupId,LocationId',
    })) || []) as any[];

    const byOccurrenceId = new Map<number, { groupId: number; locationId: number }>(
      occurrences.map((o) => [o.Id, { groupId: o.GroupId, locationId: o.LocationId }]),
    );

    const attendances = byOccurrenceId.size
      ? (((await rockGet('/Attendances', {
          $filter: [...byOccurrenceId.keys()].map((id) => `OccurrenceId eq ${id}`).join(' or '),
          $expand: 'PersonAlias/Person',
          $select:
            'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
        })) || []) as any[])
      : [];

    const occupants: RosterOccupant[] = [];
    for (const a of attendances) {
      if (!ROSTERED_RSVP.has(a.RSVP)) continue;
      const slot = byOccurrenceId.get(a.OccurrenceId);
      const person = a.PersonAlias?.Person;
      if (!slot || !a.PersonAlias?.PersonId || !person) continue;
      occupants.push({
        attendanceId: a.Id,
        personId: a.PersonAlias.PersonId,
        name: `${person.NickName || ''} ${person.LastName || ''}`.trim(),
        locationId: slot.locationId,
      });
    }

    const roles = linkedRoles.map((entry) => ({
      roleTitle: entry.role.roleTitle,
      people: mergeRosterOccupants(
        occupants.filter((o) => entry.locationIds.includes(o.locationId)),
        entry.locationIds,
      ).map((o) => ({ personId: o.personId, name: o.name })),
    }));

    return {
      success: true,
      linked: true,
      scheduleId: occurrence.scheduleId,
      isoDate: occurrence.isoDate,
      roles,
    };
  } catch (err) {
    // Fail soft: the card falls back to its stored values rather than going
    // blank minutes before a service.
    console.error('Error reading Rock roster assignments:', err);
    return { ...UNLINKED, success: false, error: 'Could not read the roster from Rock.' };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/server-actions/rockGetRosterAssignments.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/server-actions/rockGetRosterAssignments.ts src/server-actions/rockGetRosterAssignments.test.ts
git commit -m "feat: read Group Scheduler roster assignments for a runsheet occurrence"
```

---

### Task 6: `rockSyncRosterRole` write action

Blocked by Tasks 0 and 4. Use the endpoint signatures recorded in "Task 0 findings", not the ones
assumed below, if they differ.

**Files:**
- Create: `src/server-actions/rockSyncRosterRole.ts`
- Test: `src/server-actions/rockSyncRosterRole.test.ts`

**Interfaces:**
- Consumes: `getRockSession`, `canUserEditRunsheet`, `rockGet`, `rockPost`, `rockPut`, `getRockRosterRole`, `planRosterSlots`, `matchRockSchedule`, `extractChannelDate`, and `rockGetRosterAssignments` for the read-back.
- Produces:

```ts
export interface RockSyncRosterRoleResult {
  success: boolean;
  /** Rock's state after the write, for the card to settle on. */
  people: { personId: number; name: string }[];
  error?: string;
}

export async function rockSyncRosterRole(input: {
  channelName: string;
  roleTitle: string;
  personIds: number[];
}): Promise<RockSyncRosterRoleResult>;
```

Order of operations:
1. Reject unless `canUserEditRunsheet(session)`.
2. Reject if `extractChannelDate(channelName)` is before today.
3. Reject if the role is unmapped or the channel is unlinked.
4. Read the role's current occupants (same queries as Task 5, narrowed to this role's group and locations).
5. Reject if `usableRoleLocationIds` is empty — Rock does not schedule this role for this service, so there is nothing to write to. The UI will not have offered the Rock picker in that case, but the server must not rely on the UI.
6. `planRosterSlots` against the **usable** slots only, so the overflow message reflects the slots that really exist for this service. Reject the whole write if `error` is set. **Nothing is applied on rejection.**
7. Apply `removes` first, then `adds` — freeing a slot before filling it.
8. Read back and return Rock's actual post-write state.

An `add` needs the `AttendanceOccurrence` for `{ groupId, locationId, scheduleId, isoDate }`. If it
does not exist yet, create it with `POST /AttendanceOccurrences`.

- [x] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';
import { rockSyncRosterRole } from './rockSyncRosterRole';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPost: jest.fn(),
  rockPut: jest.fn(),
}));

const mockSession = jest.mocked(getRockSession);
const mockRockPut = jest.mocked(rockPut);

const EDITOR = { rolesMap: { editor: ['7001'] }, access: { runsheetCampuses: ['MNL'] } } as any;
const VIEWER = { rolesMap: { viewer: ['7001'] }, access: { runsheetCampuses: ['MNL'] } } as any;

/** A date comfortably in the future so the past-date guard never fires. */
const FUTURE = 'MNL Crowne // December 27, 2099 // 3PM';
const PAST = 'MNL Crowne // September 27, 2020 // 3PM';

describe('rockSyncRosterRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue(EDITOR);
  });

  it('refuses a viewer', async () => {
    mockSession.mockResolvedValueOnce(VIEWER);
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('You do not have permission to edit this roster.');
    expect(mockRockPut).not.toHaveBeenCalled();
  });

  it('refuses a runsheet whose date has passed', async () => {
    const res = await rockSyncRosterRole({
      channelName: PAST,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('This runsheet is in the past, so its roster can no longer be changed.');
    expect(mockRockPut).not.toHaveBeenCalled();
  });

  it('refuses an unmapped role', async () => {
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Coffee Captain',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('This role is not linked to Rock.');
    expect(mockRockPut).not.toHaveBeenCalled();
  });

  it('refuses a role Rock does not schedule for this service', async () => {
    // The runsheet is a Family Night (schedule 35), which the Service Director's
    // team carries but Security (19144, location 748) does not.
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 35, Name: 'MNL Family Night' }] },
      ] as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([
        { GroupId: 19144, LocationId: 748, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any); // 19144

    const res = await rockSyncRosterRole({
      channelName: 'MNL Family Night // December 27, 2099 // 7PM',
      roleTitle: 'Roster: Security Lead',
      personIds: [10],
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Rock does not schedule this role for this service.');
    expect(mockRockPut).not.toHaveBeenCalled();
    expect(jest.mocked(rockPost)).not.toHaveBeenCalled();
  });

  it('writes nothing when more people are assigned than the role has slots', async () => {
    // Five group-locations reads, 1 occurrences read, 1 attendances read; then the plan rejects.
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10, 20],
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Rock only has 1 slot for this role, but 2 people were assigned.');
    expect(mockRockPut).not.toHaveBeenCalled();
    expect(jest.mocked(rockPost)).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/server-actions/rockSyncRosterRole.test.ts`
Expected: FAIL — `Cannot find module './rockSyncRosterRole'`

- [x] **Step 3: Write minimal implementation**

```ts
'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserEditRunsheet } from '@/lib/permissions';
import {
  getRockRosterRole,
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  usableRoleLocationIds,
} from '@/lib/rockRosterRoles';
import { planRosterSlots, type RosterOccupant } from '@/lib/rockRosterSlots';
import { matchRockSchedule, type RockServiceCandidate } from '@/lib/rockServiceSchedule';
import { extractChannelDate } from '@/lib/runsheetDate';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';

const ROSTERED_RSVP = new Set([0, 2]);

export interface RockSyncRosterRoleResult {
  success: boolean;
  people: { personId: number; name: string }[];
  error?: string;
}

function fail(error: string): RockSyncRosterRoleResult {
  return { success: false, people: [], error };
}

function isPastChannel(channelName: string): boolean {
  const date = extractChannelDate(channelName);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

/**
 * Writes one roster role back to Rock Group Scheduler.
 *
 * Only the named role is touched. Removals unschedule; additions are created
 * confirmed; anyone who stays keeps their existing assignment untouched. A
 * rejected plan applies nothing at all.
 */
export async function rockSyncRosterRole(input: {
  channelName: string;
  roleTitle: string;
  personIds: number[];
}): Promise<RockSyncRosterRoleResult> {
  const { channelName, roleTitle, personIds } = input;

  const session = await getRockSession();
  if (!canUserEditRunsheet(session)) {
    return fail('You do not have permission to edit this roster.');
  }
  if (isPastChannel(channelName)) {
    return fail('This runsheet is in the past, so its roster can no longer be changed.');
  }

  const role = getRockRosterRole(roleTitle);
  if (!role || !isRockLinkedCampus(channelName)) {
    return fail('This role is not linked to Rock.');
  }

  try {
    // Resolve the occurrence from every linked group, exactly as the read does,
    // so a role whose own team does not carry the schedule reports *that* rather
    // than "no such service".
    const perGroup = await Promise.all(
      ROCK_ROSTER_GROUP_IDS.map((groupId) =>
        rockGet('/GroupLocations', {
          $filter: `GroupId eq ${groupId}`,
          $expand: 'Schedules,Location',
        }) as Promise<any[] | null>,
      ),
    );

    const services = new Map<number, RockServiceCandidate>();
    const scheduleIdsByLocation = new Map<number, Set<number>>();
    for (const rows of perGroup) {
      for (const row of rows || []) {
        const locationId = row.LocationId ?? row.Location?.Id;
        for (const schedule of row.Schedules || []) {
          if (!schedule?.Id) continue;
          services.set(schedule.Id, { scheduleId: schedule.Id, name: schedule.Name });
          if (locationId === undefined) continue;
          const set = scheduleIdsByLocation.get(locationId) ?? new Set<number>();
          set.add(schedule.Id);
          scheduleIdsByLocation.set(locationId, set);
        }
      }
    }

    const occurrence = matchRockSchedule(channelName, [...services.values()]);
    if (!occurrence) return fail('This runsheet does not match a Rock service.');

    // Only the slots this role really has for this service. Empty means Rock has
    // nowhere to put anyone, so the role stays free text and nothing is written.
    const usableLocationIds = usableRoleLocationIds(
      role,
      scheduleIdsByLocation,
      occurrence.scheduleId,
    );
    if (usableLocationIds.length === 0) {
      return fail('Rock does not schedule this role for this service.');
    }

    const occurrenceRows = ((await rockGet('/AttendanceOccurrences', {
      $filter: [
        `ScheduleId eq ${occurrence.scheduleId}`,
        `OccurrenceDate eq datetime'${occurrence.isoDate}T00:00:00'`,
        `GroupId eq ${role.groupId}`,
        `(${usableLocationIds.map((id) => `LocationId eq ${id}`).join(' or ')})`,
      ].join(' and '),
      $select: 'Id,LocationId',
    }, true)) || []) as any[];

    const occurrenceIdByLocation = new Map<number, number>(
      occurrenceRows.map((o) => [o.LocationId, o.Id]),
    );
    const locationByOccurrenceId = new Map<number, number>(
      occurrenceRows.map((o) => [o.Id, o.LocationId]),
    );

    const attendances = occurrenceRows.length
      ? (((await rockGet('/Attendances', {
          $filter: occurrenceRows.map((o) => `OccurrenceId eq ${o.Id}`).join(' or '),
          $expand: 'PersonAlias/Person',
          $select:
            'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
        }, true)) || []) as any[])
      : [];

    const occupants: RosterOccupant[] = [];
    for (const a of attendances) {
      if (!ROSTERED_RSVP.has(a.RSVP)) continue;
      const locationId = locationByOccurrenceId.get(a.OccurrenceId);
      const person = a.PersonAlias?.Person;
      if (locationId === undefined || !a.PersonAlias?.PersonId || !person) continue;
      occupants.push({
        attendanceId: a.Id,
        personId: a.PersonAlias.PersonId,
        name: `${person.NickName || ''} ${person.LastName || ''}`.trim(),
        locationId,
      });
    }

    const plan = planRosterSlots(occupants, personIds, usableLocationIds);
    if (plan.error) return fail(plan.error);

    // Removals first, so a swap frees the slot before it is refilled.
    for (const attendanceId of plan.removes) {
      await rockPut('/Attendances/ScheduledPersonRemove', { attendanceId });
    }

    for (const add of plan.adds) {
      let occurrenceId = occurrenceIdByLocation.get(add.locationId);
      if (!occurrenceId) {
        const created = await rockPost('/AttendanceOccurrences', {
          GroupId: role.groupId,
          LocationId: add.locationId,
          ScheduleId: occurrence.scheduleId,
          OccurrenceDate: `${occurrence.isoDate}T00:00:00`,
        });
        occurrenceId = typeof created === 'number' ? created : created?.Id;
        if (!occurrenceId) return fail('Rock could not open a schedule slot for this role.');
        occurrenceIdByLocation.set(add.locationId, occurrenceId);
      }
      await rockPut('/Attendances/ScheduledPersonAddConfirmed', {
        personId: add.personId,
        attendanceOccurrenceId: occurrenceId,
      });
    }

    // Read back rather than trusting the plan: Rock is the source of truth, and
    // a partially-applied write must surface as what actually happened.
    const after = ((await rockGet('/Attendances', {
      $filter: [...occurrenceIdByLocation.values()].map((id) => `OccurrenceId eq ${id}`).join(' or '),
      $expand: 'PersonAlias/Person',
      $select:
        'Id,OccurrenceId,RSVP,PersonAlias/PersonId,PersonAlias/Person/NickName,PersonAlias/Person/LastName',
    }, true)) || []) as any[];

    const people = after
      .filter((a) => ROSTERED_RSVP.has(a.RSVP) && a.PersonAlias?.Person)
      .map((a) => ({
        personId: a.PersonAlias.PersonId,
        name: `${a.PersonAlias.Person.NickName || ''} ${a.PersonAlias.Person.LastName || ''}`.trim(),
      }));

    return { success: true, people };
  } catch (err) {
    console.error('Error writing Rock roster assignment:', err);
    return fail('Rock rejected the roster change. Nothing was saved.');
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/server-actions/rockSyncRosterRole.test.ts`
Expected: PASS

- [x] **Step 5: Verify against `rock-preview` before going further**

Point `ROCK_API_URL` at `rock-preview`, run the app, and make one real add and one real remove on
a future occurrence. Confirm in the Group Scheduler UI that the assignment appeared confirmed and
that the removal is gone. A passing unit test is not evidence the write works.

- [x] **Step 6: Commit**

```bash
git add src/server-actions/rockSyncRosterRole.ts src/server-actions/rockSyncRosterRole.test.ts
git commit -m "feat: write one roster role back to Rock Group Scheduler"
```

---

### Task 7: Render Rock's roster in the card

**Files:**
- Modify: `src/components/runsheet/runsheetQueries.ts` (query keys block at ~line 60, hooks below it)
- Modify: `src/components/runsheet/EventTeamRosterCard.tsx` (props, `getRosterValue` at ~line 159, the Service Roles grid at ~line 213)
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx` (the `EventTeamRosterCard` render at ~line 1971)
- Test: `tests/unit/components/eventTeamRosterCard.rock.test.tsx`

**Interfaces:**
- Consumes: `rockGetRosterAssignments`, `RosterRoleAssignment` from Task 5.
- Produces:
  - `runsheetQueryKeys.rosterAssignments(channelName: string)`
  - `useRosterAssignments(channelName: string, enabled: boolean)`
  - `EventTeamRosterCard` gains props: `rockRoles?: RosterRoleAssignment[]`, `rockLinked?: boolean`, `rockReadFailed?: boolean`

Display rule: when `rockLinked` and a role appears in `rockRoles`, that role's cell shows the Rock
names joined by `, `. Otherwise the cell shows the stored `Roster:` value exactly as today.

- [x] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { EventTeamRosterCard } from '@/components/runsheet/EventTeamRosterCard';

const columns = [{ key: 'PLATFORM', name: 'Platform', fieldTypeId: 15 }] as any;
const items = [
  { id: '1', title: 'Roster: Service Director', order: -100, duration: 0, attributeValues: { PLATFORM: 'Stale Name' } },
] as any;

describe('EventTeamRosterCard with Rock roster', () => {
  it('prefers the Rock name over the stored value', () => {
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockRoles={[{ roleTitle: 'Roster: Service Director', people: [{ personId: 10, name: 'Juan Dela Cruz' }] }]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.queryByText('Stale Name')).not.toBeInTheDocument();
  });

  it('falls back to the stored value for a role Rock does not schedule here', () => {
    // Rock is linked for this runsheet, but this particular role has no slot in
    // it — that role must look exactly as it did before this feature existed.
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockRoles={[{ roleTitle: 'Roster: Music Director', people: [{ personId: 99, name: 'Ana Reyes' }] }]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
  });

  it('falls back to the stored value when Rock could not be read', () => {
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockReadFailed
        rockRoles={[]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach Rock/i)).toBeInTheDocument();
  });

  it('shows the stored value unchanged on an unlinked runsheet', () => {
    render(<EventTeamRosterCard items={items} columns={columns} onOpenRolePicker={() => {}} />);
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach Rock/i)).not.toBeInTheDocument();
  });
});
```

The card starts collapsed and reads its collapsed state from `localStorage` in an effect, so these
tests must render it expanded. Before the `render` calls, seed the preference the card reads:

```ts
import { setRosterCollapsedPreference } from '@/lib/userPreferences';
beforeEach(() => setRosterCollapsedPreference(false));
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/components/eventTeamRosterCard.rock.test.tsx`
Expected: FAIL — the Rock name is not rendered; `Stale Name` is.

- [x] **Step 3: Write minimal implementation**

In `runsheetQueries.ts`, beside the existing keys and hooks:

```ts
  rosterAssignments: (channelName: string) =>
    ['runsheet', 'rosterAssignments', channelName] as const,
```

```ts
/**
 * Rock Group Scheduler roster for this runsheet's occurrence.
 *
 * Refresh-driven by decision: fetched on mount, never polled, never refetched on
 * focus. A Group Scheduler change appears on the next page load.
 */
export function useRosterAssignments(channelName: string, enabled: boolean) {
  return useQuery(
    runsheetQueryKeys.rosterAssignments(channelName),
    () => rockGetRosterAssignments(channelName),
    {
      enabled: enabled && !!channelName,
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always',
      retry: false,
    },
  );
}
```

In `EventTeamRosterCard.tsx`, extend the props interface:

```ts
  rockRoles?: { roleTitle: string; people: { personId: number; name: string }[] }[];
  rockLinked?: boolean;
  rockReadFailed?: boolean;
```

destructure them with defaults (`rockRoles = []`, `rockLinked = false`, `rockReadFailed = false`),
and replace `getRosterValue`:

```ts
  /**
   * Rock is the source of display truth for linked roles. The stored
   * `Roster: <role>` item stays as a mirror for propagate / compare / print, and
   * is what we fall back to when Rock could not be read.
   */
  const getRosterValue = (role: string) => {
    const title = `Roster: ${role}`;
    if (rockLinked && !rockReadFailed) {
      const fromRock = rockRoles.find((r) => r.roleTitle === title);
      if (fromRock) return fromRock.people.map((p) => p.name).join(', ');
    }
    const row = items.find((item) => item.title === title);
    return row?.attributeValues?.[personCol.key] || '';
  };
```

and add the read-failure note just above the Service Roles grid:

```tsx
            {rockReadFailed && (
              <p className="mb-1 text-[10px] font-semibold text-amber-800">
                Couldn&apos;t reach Rock — showing the last saved roster.
              </p>
            )}
```

In `RunsheetTableEditor.tsx`, call the hook and pass the results through:

```tsx
  const rosterQuery = useRosterAssignments(channelName, !readOnly || true);
```

```tsx
      <EventTeamRosterCard
        items={items}
        columns={dynamicAttrCols}
        readOnly={readOnly}
        rockLinked={rosterQuery.data?.linked ?? false}
        rockRoles={rosterQuery.data?.roles ?? []}
        rockReadFailed={rosterQuery.data?.success === false}
```

(keep the existing `editingRoleTitle`, `onOpenRolePicker` and `renderPeoplePicker` props exactly as
they are).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/components/eventTeamRosterCard.rock.test.tsx && pnpm test -- tests/unit/components`
Expected: PASS, with no existing card test regressing.

- [x] **Step 5: Mirror Rock's names into the `Roster:` items**

So propagate, compare and print keep matching what the card shows, sync the stored items once per
successful Rock read. In `RunsheetTableEditor.tsx`, beside the other effects:

```tsx
  // Keep the stored `Roster:` items in step with Rock, so propagate/compare/print
  // never disagree with the card. Rock is the source of truth; these rows are a mirror.
  useEffect(() => {
    const roster = rosterQuery.data;
    if (!roster?.linked || !roster.success) return;
    const personKey = columns.find(isPersonColumn)?.key || columns[0]?.key || 'PLATFORM';
    setItems((previous) =>
      previous.map((item) => {
        const fromRock = roster.roles.find((r) => r.roleTitle === item.title);
        if (!fromRock) return item;
        const next = fromRock.people.map((p) => p.name).join(', ');
        if ((item.attributeValues?.[personKey] || '') === next) return item;
        return { ...item, attributeValues: { ...item.attributeValues, [personKey]: next } };
      }),
    );
  }, [rosterQuery.data, columns]);
```

- [x] **Step 6: Run the full component suite and commit**

Run: `pnpm test -- tests/unit/components && pnpm typecheck`
Expected: PASS

```bash
git add src/components/runsheet/runsheetQueries.ts src/components/runsheet/EventTeamRosterCard.tsx src/components/runsheet/RunsheetTableEditor.tsx tests/unit/components/eventTeamRosterCard.rock.test.tsx
git commit -m "feat: show the Rock Group Scheduler roster on the Event Team Roster card"
```

---

### Task 8: Rock-only picker and write-back on edit

Blocked by Tasks 0, 4 and 6.

**Files:**
- Create: `src/components/runsheet/RockRosterRolePicker.tsx`
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx` (the `renderPeoplePicker` callback at ~line 1990)
- Test: `tests/unit/components/rockRosterRolePicker.test.tsx`

**Interfaces:**
- Consumes: `searchRockPeople`, `rockSyncRosterRole`.
- Produces:

```tsx
export function RockRosterRolePicker(props: {
  channelName: string;
  roleTitle: string;
  /** Rock's current occupants of this role, in slot order. */
  initialPeople: { personId: number; name: string }[];
  onSaved: (people: { personId: number; name: string }[]) => void;
  onClose: () => void;
}): JSX.Element;
```

Behaviour: this picker is used **only** for roles present in `rosterQuery.data.roles`. A role Rock
does not schedule for this service is absent from that array, so the existing `PeopleSearchDropdown`
is rendered for it and that role keeps its pre-feature behaviour in full — free text, Guest toggle,
stored value, no write-back. The `linkedRole` lookup in `renderPeoplePicker` below is what enforces
this; do not replace it with a `getRockRosterRole` check, which would wrongly treat every mapped
role as linked everywhere.

Names are only ever added by choosing a Rock search result, so every chip carries a
`personId`. There is no free-text add and no Guest toggle — those are what make a name
unaddressable in Rock. Saving calls `rockSyncRosterRole`; on success it calls `onSaved` with Rock's
post-write state and closes; on failure it keeps the picker open, shows the error, and reverts the
chips to `initialPeople`.

- [x] **Step 1: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rockSyncRosterRole } from '@/server-actions/rockSyncRosterRole';
import { RockRosterRolePicker } from '@/components/runsheet/RockRosterRolePicker';

jest.mock('@/server-actions/rockSyncRosterRole', () => ({ rockSyncRosterRole: jest.fn() }));
jest.mock('@/server-actions/searchRockPeople', () => ({ searchRockPeople: jest.fn(async () => []) }));

const mockSync = jest.mocked(rockSyncRosterRole);

describe('RockRosterRolePicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the remaining people to Rock when one is removed', async () => {
    mockSync.mockResolvedValueOnce({ success: true, people: [{ personId: 20, name: 'Maria Santos' }] });
    const onSaved = jest.fn();

    render(
      <RockRosterRolePicker
        channelName="MNL Crowne // December 27, 2099 // 3PM"
        roleTitle="Roster: Worship Leaders"
        initialPeople={[
          { personId: 10, name: 'Juan Dela Cruz' },
          { personId: 20, name: 'Maria Santos' },
        ]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /remove Juan Dela Cruz/i }));
    await userEvent.click(screen.getByRole('button', { name: /save to rock/i }));

    await waitFor(() =>
      expect(mockSync).toHaveBeenCalledWith({
        channelName: 'MNL Crowne // December 27, 2099 // 3PM',
        roleTitle: 'Roster: Worship Leaders',
        personIds: [20],
      }),
    );
    expect(onSaved).toHaveBeenCalledWith([{ personId: 20, name: 'Maria Santos' }]);
  });

  it('reverts and shows the error when Rock rejects the write', async () => {
    mockSync.mockResolvedValueOnce({
      success: false,
      people: [],
      error: 'Rock only has 2 slots for this role, but 3 people were assigned.',
    });
    const onSaved = jest.fn();

    render(
      <RockRosterRolePicker
        channelName="MNL Crowne // December 27, 2099 // 3PM"
        roleTitle="Roster: Worship Leaders"
        initialPeople={[{ personId: 10, name: 'Juan Dela Cruz' }]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /remove Juan Dela Cruz/i }));
    await userEvent.click(screen.getByRole('button', { name: /save to rock/i }));

    await waitFor(() => expect(screen.getByText(/only has 2 slots/i)).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/components/rockRosterRolePicker.test.tsx`
Expected: FAIL — `Cannot find module '@/components/runsheet/RockRosterRolePicker'`

- [x] **Step 3: Write minimal implementation**

```tsx
'use client';

import { useRef, useState } from 'react';
import { HiXMark } from 'react-icons/hi2';
import { rockSyncRosterRole } from '@/server-actions/rockSyncRosterRole';
import { searchRockPeople, type RockPersonSearchResult } from '@/server-actions/searchRockPeople';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

export interface RockRosterPerson {
  personId: number;
  name: string;
}

interface RockRosterRolePickerProps {
  channelName: string;
  roleTitle: string;
  initialPeople: RockRosterPerson[];
  onSaved: (people: RockRosterPerson[]) => void;
  onClose: () => void;
}

/**
 * Picker for the roster roles that write back to Rock.
 *
 * Every name must come from Rock search so it carries a `personId` — a typed
 * name cannot be addressed in Group Scheduler, so free text and the Guest
 * affordance are deliberately absent here.
 */
export function RockRosterRolePicker({
  channelName,
  roleTitle,
  initialPeople,
  onSaved,
  onClose,
}: RockRosterRolePickerProps) {
  const [people, setPeople] = useState<RockRosterPerson[]>(initialPeople);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<RockPersonSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (term: string) => {
    setSearchTerm(term);
    if (timer.current) clearTimeout(timer.current);
    if (term.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => setResults(await searchRockPeople(term)), SEARCH_DEBOUNCE_MS);
  };

  const addPerson = (match: RockPersonSearchResult) => {
    setPeople((prev) =>
      prev.some((p) => p.personId === match.id) ? prev : [...prev, { personId: match.id, name: match.name }],
    );
    setSearchTerm('');
    setResults([]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await rockSyncRosterRole({
      channelName,
      roleTitle,
      personIds: people.map((p) => p.personId),
    });
    setSaving(false);
    if (!res.success) {
      // Fail closed: revert to what Rock had, keep the picker open.
      setPeople(initialPeople);
      setError(res.error || 'Rock rejected the roster change. Nothing was saved.');
      return;
    }
    onSaved(res.people);
    onClose();
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
      <div className="flex flex-wrap gap-1">
        {people.map((person) => (
          <span
            key={person.personId}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-900"
          >
            {person.name}
            <button
              type="button"
              aria-label={`Remove ${person.name}`}
              onClick={() => setPeople((prev) => prev.filter((p) => p.personId !== person.personId))}
              className="text-slate-500 hover:text-slate-900"
            >
              <HiXMark className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <input
        value={searchTerm}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search Rock for a person"
        aria-label="Search Rock for a person"
        className="mt-1.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]"
      />

      {results.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded border border-slate-200">
          {results.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => addPerson(match)}
                className="block w-full px-1.5 py-1 text-left text-[11px] hover:bg-slate-100"
              >
                {match.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-[10px] font-semibold text-red-700">{error}</p>}

      <div className="mt-1.5 flex justify-end gap-1">
        <button type="button" onClick={onClose} className="px-2 py-1 text-[11px] font-semibold text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save to Rock'}
        </button>
      </div>
    </div>
  );
}
```

In `RunsheetTableEditor.tsx`, use it for linked roles only — every other role keeps
`PeopleSearchDropdown` exactly as it is:

```tsx
        renderPeoplePicker={(roleTitle) => {
          const personKey = columns.find(isPersonColumn)?.key || columns[0]?.key || 'PLATFORM';
          const targetItem = items.find((item) => item.title === roleTitle);
          if (!targetItem) return null;

          const roster = rosterQuery.data;
          const linkedRole =
            roster?.linked && roster.success
              ? roster.roles.find((r) => r.roleTitle === roleTitle)
              : undefined;

          if (linkedRole) {
            return (
              <RockRosterRolePicker
                channelName={channelName}
                roleTitle={roleTitle}
                initialPeople={linkedRole.people}
                onSaved={(people) => {
                  handleAttrValueChange(targetItem.id, personKey, people.map((p) => p.name).join(', '));
                  queryClient.setQueryData(
                    runsheetQueryKeys.rosterAssignments(channelName),
                    (current: any) =>
                      current
                        ? {
                            ...current,
                            roles: current.roles.map((r: any) =>
                              r.roleTitle === roleTitle ? { ...r, people } : r,
                            ),
                          }
                        : current,
                  );
                }}
                onClose={() => closeCell(targetItem.id, personKey)}
              />
            );
          }

          const currentVal = readRunsheetCellValue(targetItem, personKey);
          return (
            <PeopleSearchDropdown
              initialValue={currentVal}
              onSelectPerson={(selectedName) => handleAttrValueChange(targetItem.id, personKey, selectedName)}
              onClose={() => closeCell(targetItem.id, personKey)}
            />
          );
        }}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/components/rockRosterRolePicker.test.tsx && pnpm typecheck`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/components/runsheet/RockRosterRolePicker.tsx src/components/runsheet/RunsheetTableEditor.tsx tests/unit/components/rockRosterRolePicker.test.tsx
git commit -m "feat: edit Rock-linked roster roles through a Rock-only picker with write-back"
```

---

### Task 9: Archived runsheets sort newest-first

Independent of every other task — this one can ship on its own.

**Files:**
- Modify: `src/lib/runsheetDate.ts` (`compareRunsheetChannels` at ~line 152, `sortRunsheetChannels` at ~line 165)
- Modify: `src/components/runsheet/RunsheetLandingView.tsx` (`filteredChannels` at ~line 245)
- Test: `src/lib/runsheetDate.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `type RunsheetSortDirection = 'asc' | 'desc'`
  - `sortRunsheetChannels<T>(channels: T[], direction?: RunsheetSortDirection): T[]` — `'asc'` by default, so every existing caller is unchanged
  - `partitionRunsheetChannelsByRecency<T>(channels: T[], today?: Date): { upcoming: T[]; past: T[] }`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { partitionRunsheetChannelsByRecency, sortRunsheetChannels } from './runsheetDate';

const CHANNELS = [
  { id: 1, name: 'MNL Crowne // September 20, 2026 // 3PM' },
  { id: 2, name: 'MNL Crowne // September 27, 2026 // 3PM' },
  { id: 3, name: 'MNL Crowne // October 4, 2026 // 3PM' },
];

describe('sortRunsheetChannels', () => {
  it('still sorts ascending by default', () => {
    expect(sortRunsheetChannels(CHANNELS).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('sorts descending when asked', () => {
    expect(sortRunsheetChannels(CHANNELS, 'desc').map((c) => c.id)).toEqual([3, 2, 1]);
  });
});

describe('partitionRunsheetChannelsByRecency', () => {
  it('splits on today, counting today as upcoming', () => {
    const { upcoming, past } = partitionRunsheetChannelsByRecency(
      CHANNELS,
      new Date(2026, 8, 27), // September 27, 2026
    );
    expect(upcoming.map((c) => c.id)).toEqual([2, 3]);
    expect(past.map((c) => c.id)).toEqual([1]);
  });

  it('treats an undated channel as upcoming rather than hiding it at the bottom', () => {
    const { upcoming } = partitionRunsheetChannelsByRecency(
      [{ id: 9, name: 'Master Template' }],
      new Date(2026, 8, 27),
    );
    expect(upcoming.map((c) => c.id)).toEqual([9]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/runsheetDate.test.ts`
Expected: FAIL — `sortRunsheetChannels` takes one argument; `partitionRunsheetChannelsByRecency` is not exported.

- [x] **Step 3: Write minimal implementation**

Replace `sortRunsheetChannels` and add the partition helper in `runsheetDate.ts`:

```ts
export type RunsheetSortDirection = 'asc' | 'desc';

/**
 * Returns a new sorted array of runsheet channels ordered by date and time
 * signature. Ascending by default — `'desc'` is what the archived list wants,
 * so last Sunday sits at the top instead of the oldest runsheet on record.
 */
export function sortRunsheetChannels<T extends { id?: number; name: string; time?: string }>(
  channels: T[],
  direction: RunsheetSortDirection = 'asc',
): T[] {
  const sorted = [...channels].sort(compareRunsheetChannels);
  return direction === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Splits channels into services still to come and services already past.
 * Today counts as upcoming — a runsheet is in use all through its own service
 * day. An undated channel counts as upcoming so it stays visible.
 */
export function partitionRunsheetChannelsByRecency<T extends { name: string }>(
  channels: T[],
  today: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);

  const upcoming: T[] = [];
  const past: T[] = [];
  for (const channel of channels) {
    const date = extractChannelDate(channel.name);
    if (date && date.getTime() < midnight.getTime()) past.push(channel);
    else upcoming.push(channel);
  }
  return { upcoming, past };
}
```

In `RunsheetLandingView.tsx`, change the tail of `filteredChannels`:

```ts
    const { upcoming, past } = partitionRunsheetChannelsByRecency(matches);
    return [...sortRunsheetChannels(upcoming), ...sortRunsheetChannels(past, 'desc')];
```

and add `partitionRunsheetChannelsByRecency` to the existing `@/lib/runsheetDate` import.

Leave the preload effect at ~line 215 alone — it wants the next five *upcoming* runsheets, and
plain `sortRunsheetChannels(channels)` still gives it those.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/runsheetDate.test.ts && pnpm test -- src/lib && pnpm typecheck`
Expected: PASS — every existing `sortRunsheetChannels` caller still gets ascending order.

- [x] **Step 5: Commit**

```bash
git add src/lib/runsheetDate.ts src/lib/runsheetDate.test.ts src/components/runsheet/RunsheetLandingView.tsx
git commit -m "feat: list archived runsheets newest-first"
```

---

### Task 10: Version bump and full verification

**Files:**
- Modify: `package.json`

- [x] **Step 1: Bump the version**

```bash
cd /Users/jerwyn/Desktop/Favor/runsheet.favor.church
npm version 1.20.0 --no-git-tag-version
```

- [x] **Step 2: Run the whole suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. Do not claim completion on a partial run — paste the actual output.

- [x] **Step 3: Smoke-test the two features against `rock-preview`**

- Open a future MNL runsheet: the ten roles show Rock's names, and the card shows no error note.
- Change one role in Group Scheduler, reload the runsheet page: the new name is there.
- Edit one role in the runsheet, check Group Scheduler: the person is scheduled confirmed, and the
  person removed is gone. Confirm the other nine roles are untouched.
- Open a BNE runsheet: the card is unchanged free text.
- Open an `MNL Family Night` runsheet: Host Core Cap and Security Lead are plain free-text cells
  with the Guest toggle, because groups 19096 and 19144 carry no Family Night schedule — while the
  roles whose teams do carry it still autofill from Rock.
- Tick **Show Archived** on the landing page: the most recent past runsheet is at the top of the
  archived block.

- [x] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: release 1.20.0"
```

---

## Self-Review Notes

Spec coverage check, run after writing this plan:

- Role mapping → Task 1. Occurrence resolution → Task 2. Slot fill and overflow rejection → Task 3.
- Reading, RSVP filter, fail-soft → Task 5 and Task 7.
- Per-role fallback when Rock has no slot for that role on that service → `usableRoleLocationIds`
  in Task 1, role filtering in Task 5, the write guard in Task 6, the card fallback in Task 7, and
  the picker choice in Task 8.
- Writing, confirmed adds, unschedule removes, untouched stayers, edit permission, past-date guard,
  single-role scope → Task 6.
- Rock-only person identity, non-persisted IDs, fail-closed revert → Task 8.
- `Roster:` items kept as a mirror → Task 7, Step 5.
- Archive sort → Task 9.
- Version bump → Task 10.
- The write-authorisation risk called out in the spec is Task 0, which gates Tasks 4, 6 and 8.

---

## Task 0 findings

Spike run on 2026-09-28 against `rock-preview` and `rock.favor.church`:

1. **RestAction Definitions & Endpoints:**
   - Action Id 249: `PUT /api/Attendances/ScheduledPersonAddConfirmed?personId={personId}&attendanceOccurrenceId={attendanceOccurrenceId}`
     - Method: `PUT`
     - Query parameters: `personId` (Int32), `attendanceOccurrenceId` (Int32)
     - Response: HTTP 200 with created `Attendance` object. Sets `RSVP: 1` / `ScheduledToAttend: true`.
   - Action Id 247: `PUT /api/Attendances/ScheduledPersonRemove?attendanceId={attendanceId}`
     - Method: `PUT`
     - Query parameters: `attendanceId` (Int32)
     - Response: HTTP 204 No Content. Updates attendance to `RSVP: 3` (Unscheduled) and `ScheduledToAttend: false`.

2. **Authorization & Permissions:**
   - Both `rock-preview` and `rock.favor.church` (prod) have identical `Auth` rows on `RestAction` 247 and 249 (created 2026-07-24 and updated 2026-09-17 for GroupIds 103370 and 103372).
   - In both environments, the app's `ROCK_API_KEY` maps to `PersonId: 5` (`FAVOR AUTOMATION | JA`), which is in `RMR - Rock Administration` (GroupId 2).
   - Live call test with preview `ROCK_API_KEY`:
     - `ScheduledPersonAddConfirmed` on future occurrence `14080`: Succeeded with **HTTP 200**, created Attendance `188847`.
     - `ScheduledPersonRemove` on `188847`: Succeeded with **HTTP 204**, unscheduled the person (`RSVP: 3`, `ScheduledToAttend: false`).
     - Test attendance `188847` was subsequently deleted via `DELETE /api/Attendances/188847` (HTTP 204).

3. **Critical HTTP / IIS Discovery:**
   - Parameter-only `PUT` requests without a body return **HTTP 411 Length Required** from IIS/Cloudflare unless a `Content-Length: 0` header (or empty body) is explicitly sent.
   - Task 4 (`rockFetch.ts`) must ensure `Content-Length: '0'` or an empty string body is included for parameter-only `PUT` calls.

4. **Gate Status:**
   - **UNBLOCKED.** Both actions are callable and verified working with the application API key on both preview and production. Tasks 4, 6, and 8 may proceed as planned.
