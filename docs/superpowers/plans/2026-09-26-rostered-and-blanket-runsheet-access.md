# Rostered and Blanket Runsheet Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ministry Team volunteers see only the Sunday/general runsheets for the campus, date and time they are rostered on. Events Teams keep campus-wide view but lose edit rights. Grow Heads stay limited to Grow runsheets.

**Architecture:**
- `resolveRunsheetAccessPolicy` stops granting blanket view to Group Type 23, except Events Teams. It also stops granting Events Team leaders edit rights.
- `rockResolveAccess` turns the user's Scheduler attendances into `rolesMap.rosteredViewer` keys of the form `<campus>:<YYYY-MM-DD>:<HH:MM:SS>`. It builds them from `Attendance.CampusId` and `Attendance.StartDateTime`, and leaves out attendances on Grow schedules.
- `canViewRunsheetChannel` gains a final roster-matching branch.
- The Grow rules and every mutation gate are otherwise unchanged.

**Tech Stack:** TypeScript, Next.js 15 server actions, Rock RMS REST v1, Jest + ts-jest.

## Global Constraints

- Access matrix, copied from the spec:

| Role / Group | General & Sunday Runsheets | Grow Class Runsheets | Can Edit? |
|---|---|---|---|
| Global Staff / Admins | Blanket View (all campuses) | Blanket View (all campuses) | Yes (all campuses) |
| Campus Staff (Org Unit 28) | Blanket View (own campus) | Blanket View (own campus) | Yes (own campus) |
| Events Team (`* Events Team`, Group Type 23) | Blanket View (own campus) | Denied unless rostered | No |
| Grow Course Heads (19108) | Denied unless rostered | Blanket View (Grow only) | Yes (Grow only) |
| Ministry Volunteers | Rostered only (matching date & time) | Denied unless rostered | No |
| Grow Rostered Volunteers | Denied unless rostered | Rostered only (matching course date) | No |
| Unauthenticated / non-rostered | Denied | Denied | No |

- These values were verified in production Rock on 2026-09-26:
  - Campus IDs: `1` → `MNL`, `2` → `BNE`, `3` → `SEL`. Any other campus ID (5 OPEN ACCESS, 6 QCY) produces no roster key.
  - `Attendance` exposes `CampusId`, `StartDateTime` (local, e.g. `2026-09-27T17:00:00`) and `OccurrenceId`. It has **no** `Occurrence` navigation property.
- Roster key: `<campus>:<YYYY-MM-DD>:<HH:MM:SS>`, e.g. `MNL:2026-09-27:15:00:00`. The runsheet side of the key comes from `extractRunsheetCampus`, `extractChannelDate` and `parseTimeToSortSignature(extractChannelTime(name))`.
- **Known limitation, accepted by the spec's key format:** the key has no venue. A volunteer rostered for MNL 3PM can see every MNL runsheet titled with that date and 3PM, for example both `MNL Crowne` and `MNL Shang` if they share that slot.
- Attendances on a Grow Courses schedule (category 483) never produce a `rosteredViewer` key. They still feed `growViewer`.
- Titles classified as Grow by `getRunsheetKind` never match a roster key.
- The roster lookup window runs from 7 days ago onward, as it does now.
- `resolveRunsheetAccessPolicy`'s signature and its `usedLeaderRoleFallback` field stay, because `scripts/audit-runsheet-access.ts` depends on them. Only the edit and view rules change.
- A Rock failure during roster lookup grants no roster access (fail closed) and must not fail the session.
- Versioning (semver): **1.17.1 → 1.18.0**.
- Run tests with `pnpm test -- <path>`, and finish with `pnpm test && pnpm typecheck && pnpm lint`.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Map

| File | Change |
|---|---|
| `src/lib/runsheetAccessPolicy.ts` (+ test) | Group Type 23: view only for Events Teams; no Events edit |
| `src/lib/rosterAccess.ts` (new, + test) | Pure: roster keys from attendances and from channel titles |
| `src/lib/permissions.ts` (+ test) | `ROSTERED_VIEWER_ROLE`; counts toward page access |
| `src/lib/runsheetChannelAccess.ts` (+ test) | Grow-kind titles fail closed; roster matching branch |
| `src/server-actions/internal/rockResolveAccess.ts` (+ test) | Fetch attendance campus and time; write `rosteredViewer` |
| `src/server-actions/runsheetAccessBehavior.test.ts` | Channel list returns only the rostered channel |
| `package.json` | 1.18.0 |

---

### Task 1: Narrow the blanket policy

**Files:**
- Modify: `src/lib/runsheetAccessPolicy.ts` (the `canEdit` and `canView` lines inside the `for` loop, about lines 99-106)
- Test: `src/lib/runsheetAccessPolicy.test.ts`

**Interfaces:**
- Produces: the same `resolveRunsheetAccessPolicy` signature and result shape. Behaviour changes:
  - A Group Type 23 membership contributes `viewerGroupIds` and a campus to `runsheetCampuses` **only** when the group name matches `EVENTS_TEAM_NAME_PATTERN`.
  - No Group Type 23 membership ever contributes to `editorGroupIds`.

- [ ] **Step 1: Update the existing tests to the new rules, and add one**

In `src/lib/runsheetAccessPolicy.test.ts`:

1. `'promotes a YTH Events Team leader to edit its MNL campus'`: rename it to `'keeps a YTH Events Team leader view-only for its MNL campus'` and change `expect(result.editorGroupIds).toEqual(['32929']);` to `expect(result.editorGroupIds).toEqual([]);`. Keep the viewer and campus expectations.
2. `'keeps a non-Events Ministry Team leader view-only'`: rename it to `'gives a non-Events Ministry Team leader no blanket access'` and replace its three expectations with:

```ts
    expect(result.editorGroupIds).toEqual([]);
    expect(result.viewerGroupIds).toEqual([]);
    expect(result.runsheetCampuses).toEqual([]);
```

3. `'uses the approved leader-role fallback only when the Rock role lookup failed'`: change `expect(result.editorGroupIds).toEqual(['19109']);` to `expect(result.editorGroupIds).toEqual([]);`. Keep `expect(result.usedLeaderRoleFallback).toBe(true);`.
4. Scan the `it.each` table (it starts with `'Org Chart staff edits only its campus'`). For every row whose membership is Group Type 23 and whose group name does **not** end in "Events Team", set `expectedViewer: []` and `expectedCampuses: []`. For every Group Type 23 row with a non-empty `expectedEditor`, set `expectedEditor: []`.
5. Add this test inside the `describe`:

```ts
  it('gives the Grow Team no blanket Sunday access', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 19108, groupTypeId: 23, groupRoleId: 20 }],
      new Map([[19108, { groupId: 19108, groupTypeId: 23, name: 'MNL Grow Team', parentGroupId: 57 }]]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
      new Set([20]),
    );

    expect(result).toMatchObject({ editorGroupIds: [], viewerGroupIds: [], runsheetCampuses: [] });
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- src/lib/runsheetAccessPolicy.test.ts`
Expected: the edited and added cases FAIL, because the current code still grants these.

- [ ] **Step 3: Implement**

In `src/lib/runsheetAccessPolicy.ts`, replace:

```ts
    const canEdit = isGlobal || isCampusEditor || (isMinistryMember && isEventsTeam && isLeader);
    const canView = isGlobal || isCampusEditor || isMinistryMember;
```

with:

```ts
    // Ministry Teams no longer get blanket access: only Events Teams keep a
    // campus-wide view, and no Ministry Team role edits. Everyone else sees
    // the runsheets they are rostered on (see lib/rosterAccess).
    const canEdit = isGlobal || isCampusEditor;
    const canView = isGlobal || isCampusEditor || (isMinistryMember && isEventsTeam);
```

`isLeader` is now unused. Delete its declaration, but keep the `leaderRoleIds` and `leaderRoleLookupFailed` parameters and the `usedLeaderRoleFallback` result so callers and the audit script still compile. Rename `leaderRoleIds` to `_leaderRoleIds` if lint reports it as unused.

Update the doc comment on `EVENTS_TEAM_NAME_PATTERN` to: `/** Group names ending this way are Events Teams; they get a campus-wide view (never edit). */`

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test -- src/lib/runsheetAccessPolicy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetAccessPolicy.ts src/lib/runsheetAccessPolicy.test.ts
git commit -m "feat: limit blanket Ministry Team runsheet access to Events Team view"
```

---

### Task 2: Roster key helpers

**Files:**
- Create: `src/lib/rosterAccess.ts`
- Test: `src/lib/rosterAccess.test.ts`

**Interfaces:**
- Consumes: `extractRunsheetCampus`, `RunsheetCampusCode` (`runsheetCampus.ts`); `extractChannelDate`, `extractChannelTime`, `parseTimeToSortSignature` (`runsheetDate.ts`); `getRunsheetKind` (`runsheetKind.ts`).
- Produces:
  - `ROCK_CAMPUS_CODES: Record<number, RunsheetCampusCode>`, i.e. `{ 1: 'MNL', 2: 'BNE', 3: 'SEL' }`
  - `interface RosteredAttendance { campusId: number | null; startDateTime: string; scheduleId: number | null }`
  - `rosterKey(campus: RunsheetCampusCode, isoDate: string, timeSignature: string): string`
  - `buildRosteredViewerKeys(attendances: RosteredAttendance[], growScheduleIds: ReadonlySet<number>): string[]` (deduplicated)
  - `channelRosterKey(channelName: string): string | null`, which returns `null` for Grow titles or titles without a campus, date or time

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { buildRosteredViewerKeys, channelRosterKey, rosterKey } from './rosterAccess';

describe('rosterKey', () => {
  it('joins campus, date and time signature', () => {
    expect(rosterKey('MNL', '2026-09-27', '15:00:00')).toBe('MNL:2026-09-27:15:00:00');
  });
});

describe('buildRosteredViewerKeys', () => {
  const grow = new Set([752]);

  it('builds keys from attendance campus and local start time', () => {
    expect(
      buildRosteredViewerKeys(
        [
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 311 },
          { campusId: 2, startDateTime: '2026-09-27T17:30:00', scheduleId: 400 },
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 311 },
        ],
        grow,
      ),
    ).toEqual(['MNL:2026-09-27:15:00:00', 'BNE:2026-09-27:17:30:00']);
  });

  it('skips Grow schedules, unknown campuses and malformed times', () => {
    expect(
      buildRosteredViewerKeys(
        [
          { campusId: 1, startDateTime: '2026-09-27T15:00:00', scheduleId: 752 },
          { campusId: 6, startDateTime: '2026-09-27T09:00:00', scheduleId: 311 },
          { campusId: null, startDateTime: '2026-09-27T09:00:00', scheduleId: 311 },
          { campusId: 1, startDateTime: 'not a date', scheduleId: 311 },
        ],
        grow,
      ),
    ).toEqual([]);
  });
});

describe('channelRosterKey', () => {
  it('derives the key from a service title', () => {
    expect(channelRosterKey('MNL Crowne // September 27, 2026 // 3PM')).toBe('MNL:2026-09-27:15:00:00');
    expect(channelRosterKey('BNE Chapel // September 27, 2026 // 5:30PM')).toBe('BNE:2026-09-27:17:30:00');
  });

  it('never keys a Grow title or an incomplete title', () => {
    expect(channelRosterKey('MNL Grow - Build x FDNA // September 27, 2026 // 3PM')).toBeNull();
    expect(channelRosterKey('MNL Crowne // September 27, 2026')).toBeNull();
    expect(channelRosterKey('Crowne // September 27, 2026 // 3PM')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/rosterAccess.test.ts`
Expected: FAIL with "Cannot find module './rosterAccess'".

- [ ] **Step 3: Implement**

```ts
/**
 * Rostered-only runsheet view. A volunteer's Group Scheduler attendances
 * become `<campus>:<YYYY-MM-DD>:<HH:MM:SS>` keys; a runsheet is visible to
 * them when its title yields the same key. The key has no venue, so every
 * same-campus runsheet in that date/time slot matches.
 */
import { extractRunsheetCampus, type RunsheetCampusCode } from './runsheetCampus';
import { extractChannelDate, extractChannelTime, parseTimeToSortSignature } from './runsheetDate';
import { getRunsheetKind } from './runsheetKind';

/** Rock Campus.Id → runsheet campus code (verified 2026-09-26). */
export const ROCK_CAMPUS_CODES: Record<number, RunsheetCampusCode> = { 1: 'MNL', 2: 'BNE', 3: 'SEL' };

export interface RosteredAttendance {
  campusId: number | null;
  startDateTime: string;
  scheduleId: number | null;
}

export function rosterKey(campus: RunsheetCampusCode, isoDate: string, timeSignature: string): string {
  return `${campus}:${isoDate}:${timeSignature}`;
}

export function buildRosteredViewerKeys(
  attendances: RosteredAttendance[],
  growScheduleIds: ReadonlySet<number>,
): string[] {
  const keys = new Set<string>();
  for (const a of attendances) {
    // Grow sessions have their own access (growViewer); a Sunday 3PM Grow
    // class must not unlock the Sunday 3PM service runsheet.
    if (a.scheduleId !== null && growScheduleIds.has(a.scheduleId)) continue;
    const campus = a.campusId !== null ? ROCK_CAMPUS_CODES[a.campusId] : undefined;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):?(\d{2})?/.exec(a.startDateTime || '');
    if (!campus || !m) continue;
    keys.add(rosterKey(campus, m[1], `${m[2]}:${m[3] || '00'}`));
  }
  return [...keys];
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function channelRosterKey(channelName: string): string | null {
  if (!channelName || getRunsheetKind(channelName) === 'grow') return null;
  const campus = extractRunsheetCampus(channelName);
  const date = extractChannelDate(channelName);
  const time = parseTimeToSortSignature(extractChannelTime(channelName));
  if (!campus || !date || !time) return null;
  return rosterKey(campus, toIsoLocal(date), time);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/rosterAccess.test.ts`
Expected: PASS. If `parseTimeToSortSignature('3PM')` returns anything other than `'15:00:00'`, stop and report. The key format depends on that exact output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rosterAccess.ts src/lib/rosterAccess.test.ts
git commit -m "feat: derive rostered runsheet keys from attendances and titles"
```

---

### Task 3: Roster role in permissions and channel access

**Files:**
- Modify: `src/lib/permissions.ts`, `src/lib/runsheetChannelAccess.ts`
- Test: `src/lib/permissions.test.ts`, `src/lib/runsheetChannelAccess.test.ts`

**Interfaces:**
- Consumes: `channelRosterKey` (Task 2), `getRunsheetKind`.
- Produces:
  - `ROSTERED_VIEWER_ROLE = 'rosteredViewer'` in `permissions.ts`. `canUserAccessRunsheet` returns true when this role is present. `canUserEditRunsheet` does not change.
  - The `canViewRunsheetChannel` signature is unchanged. It now evaluates in this order:
    1. Blanket editor or viewer with campus scope → allow.
    2. The title matches a Grow schedule → Grow rules decide.
    3. The title is Grow by kind but matches no schedule → deny.
    4. Allow if `rosteredViewer` contains `channelRosterKey(name)`.
  - `canEditRunsheetChannel` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/permissions.test.ts`, and import `canUserEditRunsheet` if it isn't imported already:

```ts
  it('lets a rostered volunteer access runsheets without editing', () => {
    const user = { rolesMap: { rosteredViewer: ['MNL:2026-09-27:15:00:00'] } };
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(canUserEditRunsheet(user)).toBe(false);
  });
```

Add to `src/lib/runsheetChannelAccess.test.ts`. It already defines `grow`, `GROW_TITLE` and `SUNDAY` = `'MNL Crowne // September 27, 2026 // 3PM'`:

```ts
describe('rostered-only view', () => {
  const rostered = { rolesMap: { rosteredViewer: ['MNL:2026-09-27:15:00:00'] }, access: { runsheetCampuses: [] } };

  it('shows the exact rostered campus, date and time', () => {
    expect(canViewRunsheetChannel(rostered, SUNDAY, grow)).toBe(true);
  });

  it('hides other times, dates and campuses', () => {
    expect(canViewRunsheetChannel(rostered, 'MNL Crowne // September 27, 2026 // 5PM', grow)).toBe(false);
    expect(canViewRunsheetChannel(rostered, 'MNL Crowne // October 4, 2026 // 3PM', grow)).toBe(false);
    expect(canViewRunsheetChannel(rostered, 'BNE Chapel // September 27, 2026 // 3PM', grow)).toBe(false);
  });

  it('never opens a Grow runsheet in the same slot', () => {
    expect(canViewRunsheetChannel(rostered, 'MNL Grow - Build x FDNA // September 27, 2026 // 3PM', grow)).toBe(false);
    expect(canViewRunsheetChannel(rostered, 'MNL Grow - Build x FDNA // September 27, 2026 // 3PM', [])).toBe(false);
  });

  it('never lets a rostered volunteer edit', () => {
    expect(canEditRunsheetChannel(rostered, SUNDAY, grow)).toBe(false);
  });

  it('gives an Events Team viewer campus-wide view but no edit', () => {
    const events = { rolesMap: { viewer: ['19109'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canViewRunsheetChannel(events, 'MNL Crowne // October 4, 2026 // 5PM', grow)).toBe(true);
    expect(canEditRunsheetChannel(events, SUNDAY, grow)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- src/lib/permissions.test.ts src/lib/runsheetChannelAccess.test.ts`
Expected: the rostered cases FAIL.

- [ ] **Step 3: Implement**

In `src/lib/permissions.ts`, add below `GROW_VIEWER_ROLE`:

```ts
/** Rostered volunteers: values are `<campus>:<YYYY-MM-DD>:<HH:MM:SS>` roster keys. */
export const ROSTERED_VIEWER_ROLE = 'rosteredViewer';
```

and change `canUserAccessRunsheet` to:

```ts
export function canUserAccessRunsheet(user?: HasRolesMap | AuthUser | null): boolean {
  return (
    canUserEditRunsheet(user) ||
    hasRole(user, 'viewer') ||
    hasRole(user, GROW_VIEWER_ROLE) ||
    hasRole(user, ROSTERED_VIEWER_ROLE)
  );
}
```

In `src/lib/runsheetChannelAccess.ts`, update the imports:

```ts
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE, ROSTERED_VIEWER_ROLE } from './permissions';
import { channelRosterKey } from './rosterAccess';
import { getRunsheetKind } from './runsheetKind';
```

Replace the body of `canViewRunsheetChannel` after its first `if` (the blanket check) with:

```ts
  const match = matchGrowRunsheet(channelName, growSchedules);
  if (match) {
    if (has(session, GROW_EDITOR_ROLE)) return true;
    return (session?.rolesMap?.[GROW_VIEWER_ROLE] || []).includes(growOccurrenceKey(match.scheduleId, match.date));
  }
  // A Grow-looking title that matches no known schedule fails closed.
  if (getRunsheetKind(channelName) === 'grow') return false;

  const key = channelRosterKey(channelName);
  return key !== null && (session?.rolesMap?.[ROSTERED_VIEWER_ROLE] || []).includes(key);
```

Update the file's top comment to: `Per-channel runsheet access: blanket campus rules first, then Grow Course rules, then rostered-only matching (lib/rosterAccess).`

`growSchedules` is `[]` for sessions without a Grow role, because callers only fetch it when `hasGrowRole` is true. In that case `match` is `null`, and the Grow-kind check keeps Grow titles closed. No caller changes are needed.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test -- src/lib`
Expected: PASS, including the existing Grow cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions.test.ts src/lib/runsheetChannelAccess.ts src/lib/runsheetChannelAccess.test.ts
git commit -m "feat: allow rostered volunteers to view their rostered runsheet"
```

---

### Task 4: Resolve roster keys from Rock

**Files:**
- Modify: `src/server-actions/internal/rockResolveAccess.ts`:
  - `fetchRosteredOccurrences` (about line 228)
  - the Grow `try` block (about lines 444-466)
- Test: `src/server-actions/internal/rockResolveAccess.test.ts`

**Interfaces:**
- Consumes: `buildRosteredViewerKeys`, `RosteredAttendance` (Task 2); `ROSTERED_VIEWER_ROLE` (Task 3); the existing `resolveGrowAccess`.
- Produces:
  - `fetchRosteredOccurrences` returns `{ grow: Array<{ scheduleId: number; occurrenceDate: string }>; attendances: RosteredAttendance[] }`.
  - The session gains `rolesMap.rosteredViewer` when keys exist.

- [ ] **Step 1: Update and add resolver tests**

In `src/server-actions/internal/rockResolveAccess.test.ts`:

1. `'falls back when GroupType 23 returns an empty leader-role set'`: the Events leader is now view-only. Change `expect(result.rolesMap.editor).toEqual(['19109']);` to:

```ts
      expect(result.rolesMap.editor).toBeUndefined();
      expect(result.rolesMap.viewer).toEqual(['19109']);
```

Keep the campus and warn expectations. The leader lookup still runs and still warns.

2. Search the file for other Group Type 23 fixtures whose name does not end in "Events Team" but whose test expects `viewer` or `runsheetCampuses` from them. Update those expectations to no blanket access. The `'MNL Events Team'` fixtures (19109) keep `viewer`.

3. Add this test. It uses the file's existing `mockFetch` and `rockResponse` helpers:

```ts
  it('adds rostered-only keys from Scheduler attendances, excluding Grow schedules', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/People') return rockResponse([{ Id: 410, FirstName: 'Rostered', LastName: 'Volunteer' }]);
      if (path === '/GroupMembers') return rockResponse([]);
      if (path === '/PersonAlias') return rockResponse([{ Id: 9410 }]);
      if (path === '/Attendances') {
        return rockResponse([
          { OccurrenceId: 1, CampusId: 1, StartDateTime: '2099-09-27T15:00:00' },
          { OccurrenceId: 2, CampusId: 1, StartDateTime: '2099-09-27T15:00:00' },
        ]);
      }
      if (path === '/AttendanceOccurrences') {
        return rockResponse([
          { Id: 1, ScheduleId: 311, OccurrenceDate: '2099-09-27T00:00:00' },
          { Id: 2, ScheduleId: 752, OccurrenceDate: '2099-09-27T00:00:00' },
        ]);
      }
      if (path === '/Schedules') return rockResponse([{ Id: 752, Name: 'MNL Grow - Build x FDNA', iCalendarContent: '' }]);
      return rockResponse([]);
    });

    const result = await rockResolveAccess([410]);

    expect(result.rolesMap.rosteredViewer).toEqual(['MNL:2099-09-27:15:00:00']);
    expect(result.rolesMap.growViewer).toEqual(['752:2099-09-27']);
    expect(result.rolesMap.viewer).toBeUndefined();
  });
```

If `fetchGrowSchedules` goes through the mocked `rockGet` module rather than global `fetch` in this test file, route `/Schedules` through whichever mock the file uses for `rockGet`. Check the top of the test file for `jest.mock('@/server-actions/internal/rockFetch'`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- src/server-actions/internal/rockResolveAccess.test.ts`
Expected: the new test FAILS because `rosteredViewer` is undefined. The edited tests may already pass after Task 1, which is fine.

- [ ] **Step 3: Return attendance details from `fetchRosteredOccurrences`**

Add these imports:

```ts
import { buildRosteredViewerKeys, type RosteredAttendance } from '@/lib/rosterAccess';
```

and add `ROSTERED_VIEWER_ROLE` to the existing `@/lib/permissions` import.

Replace `fetchRosteredOccurrences` with:

```ts
/**
 * Scheduler assignments (any rostering group) from 7 days ago onward: the
 * Grow occurrences for growViewer, and each attendance's campus/start time
 * (with its schedule) for rosteredViewer.
 */
async function fetchRosteredOccurrences(personIds: number[]): Promise<{
  grow: Array<{ scheduleId: number; occurrenceDate: string }>;
  attendances: RosteredAttendance[];
}> {
  const empty = { grow: [], attendances: [] };
  const aliases = (await rawRockGet('/PersonAlias', {
    $filter: orFilter('PersonId', personIds),
    $select: 'Id',
    $top: 100,
  })) || [];
  const aliasIds = (aliases as any[]).map((a) => Number(a.Id)).filter((id) => id > 0);
  if (aliasIds.length === 0) return empty;

  const rawAttendances = ((await rawRockGet('/Attendances', {
    $filter: `(${orFilter('PersonAliasId', aliasIds)}) and ScheduledToAttend eq true and StartDateTime ge datetime'${manilaDateDaysAgo(7)}T00:00:00'`,
    $select: 'OccurrenceId,CampusId,StartDateTime',
    $top: 500,
  })) || []) as any[];
  const occurrenceIds = [...new Set(rawAttendances.map((a) => Number(a.OccurrenceId)).filter((id) => id > 0))];
  if (occurrenceIds.length === 0) return empty;

  const occurrences = ((await rawRockGet('/AttendanceOccurrences', {
    $filter: orFilter('Id', occurrenceIds),
    $select: 'Id,ScheduleId,OccurrenceDate',
    $top: 500,
  })) || []) as any[];
  const scheduleByOccurrence = new Map<number, number>(
    occurrences.filter((o) => o.ScheduleId != null).map((o) => [Number(o.Id), Number(o.ScheduleId)]),
  );

  return {
    grow: occurrences
      .filter((o) => o.ScheduleId != null && o.OccurrenceDate)
      .map((o) => ({ scheduleId: Number(o.ScheduleId), occurrenceDate: String(o.OccurrenceDate) })),
    attendances: rawAttendances.map((a) => ({
      campusId: a.CampusId != null ? Number(a.CampusId) : null,
      startDateTime: String(a.StartDateTime || ''),
      scheduleId: scheduleByOccurrence.get(Number(a.OccurrenceId)) ?? null,
    })),
  };
}
```

- [ ] **Step 4: Write both role sets in the resolver**

In the Grow `try` block:
- Rename the destructured `rostered` to `roster`.
- Pass `rostered: roster.grow` to `resolveGrowAccess`.
- After the two existing `rolesMap[GROW_...]` assignments, add:

```ts
      const growScheduleIds = new Set(growSchedules.map((s) => s.id));
      const rosteredKeys = buildRosteredViewerKeys(roster.attendances, growScheduleIds);
      if (rosteredKeys.length > 0) rolesMap[ROSTERED_VIEWER_ROLE] = rosteredKeys;
```

Reuse `growScheduleIds` in the `resolveGrowAccess` call instead of building the set twice.

Update the block's comment to:

```ts
    // Grow Course and rostered-only access only ever add to the roles
    // above. Any Rock failure here grants neither, rather than failing the
    // session.
```

Update the warn message to `'[runsheet-access] roster/Grow access lookup failed; granting no roster or Grow access'`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm test -- src/server-actions/internal && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server-actions/internal/rockResolveAccess.ts src/server-actions/internal/rockResolveAccess.test.ts
git commit -m "feat: resolve rostered-only runsheet keys from Scheduler attendances"
```

---

### Task 5: End-to-end list, detail and edit behaviour

**Files:**
- Test: `src/server-actions/runsheetAccessBehavior.test.ts` (extend)

**Interfaces:**
- Consumes: everything above. No production code changes are expected. If a test fails, fix the lib module it points to, not the test.

- [ ] **Step 1: Add the behaviour tests**

Add to `src/server-actions/runsheetAccessBehavior.test.ts`, using its existing `mockGetRockSession`, `mockRockGet` and `expectNoRockWrites` helpers. Follow the URL-routing `mockImplementation` style of the existing "Grow Course access" block:

```ts
describe('rostered-only access', () => {
  const channels = [
    { Id: 931, Name: 'MNL Crowne // December 26, 2099 // 3PM' },
    { Id: 932, Name: 'MNL Crowne // December 26, 2099 // 5PM' },
    { Id: 933, Name: 'MNL Grow - Build x FDNA // December 26, 2099 // 3PM' },
  ];

  function routeRockGet() {
    mockRockGet.mockImplementation((async (url: string) => {
      if (url === '/ContentChannels') return channels;
      const byId = channels.find((c) => url === `/ContentChannels/${c.Id}`);
      if (byId) return { ...byId, ContentChannelTypeId: 13 };
      return [];
    }) as any);
  }

  const rostered = {
    rolesMap: { rosteredViewer: ['MNL:2099-12-26:15:00:00'] },
    access: { runsheetCampuses: [] },
  } as any;

  it('lists only the rostered service', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue(rostered);
    const res = await rockGetAvailableRunsheetChannels();
    expect(res.channels.map((c) => c.id)).toEqual([931]);
  });

  it('opens the rostered runsheet and refuses the next service', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue(rostered);
    expect((await rockGetRunsheetDetails(932)).success).toBe(false);
  });

  it('refuses edits from a rostered volunteer', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue(rostered);
    const res = await rockDeleteServiceRunsheet(931);
    expect(res.success).toBe(false);
    expectNoRockWrites();
  });

  it('refuses edits from an Events Team viewer', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue({ rolesMap: { viewer: ['19109'] }, access: { runsheetCampuses: ['MNL'] } } as any);
    const res = await rockDeleteServiceRunsheet(931);
    expect(res.success).toBe(false);
    expectNoRockWrites();
  });
});
```

Call `rockDeleteServiceRunsheet` the same way the existing delete tests in this file do. If `rockGetRunsheetDetails` needs further routed responses (such as `/Attributes`) to reach its access check, route them to `[]`. The denial happens before those calls.

- [ ] **Step 2: Run the tests**

Run: `pnpm test -- src/server-actions/runsheetAccessBehavior.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server-actions/runsheetAccessBehavior.test.ts
git commit -m "test: cover rostered-only list, detail and edit behaviour"
```

---

### Task 6: Release 1.18.0

**Files:**
- Modify: `package.json` (`"version": "1.17.1"` → `"1.18.0"`)

- [ ] **Step 1: Bump the version**

Set `"version": "1.18.0",` in `package.json`.

- [ ] **Step 2: Run the full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. `tests/unit/scripts/audit-runsheet-access.test.ts` must still pass. If it asserts that an Events Team leader or a non-Events Ministry Team member has edit or view access, update only the expected access values to match the matrix above, and record that in the commit message.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: release 1.18.0"
```
