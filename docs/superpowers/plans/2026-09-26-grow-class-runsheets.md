# Grow Class Runsheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let MNL Grow Team Heads create and edit Grow Course runsheets, auto-create one runsheet per upcoming date of each Grow Courses topic, let rostered volunteers view their own Grow runsheet, broaden schedule fetching to the ALL EVENTS tree, and add a Sunday/Youth/Grow/Other filter to the runsheet list.

**Architecture:** Grow access is encoded as two new `rolesMap` keys (`growEditor`, `growViewer`) resolved in `rockResolveAccess`, so the session cache and access-scope key pick them up unchanged. Pure modules hold the rules (iCal expansion, Grow title matching, Grow access, channel access, runsheet kind) and are unit-tested. Server actions wire them in. The auto-sync runs as a server action fired once from `RunsheetManager` when the page loads.

**Tech Stack:** Next.js 15 server actions, TypeScript, Rock RMS REST v1 (OData), Jest + ts-jest, react-query v3, Tailwind.

## Global Constraints

- Existing access rules are unchanged. Grow rules only add access, and only for Grow runsheets.
- Grow schedules: schedule category **483**. New Grow runsheets attach to content channel category **338**. The Grow Team is group **19108**.
- Grow editor role names (case-insensitive): `Overall Head`, `Unit Head`. Match by name, never by ID.
- A Grow runsheet title is `<Grow schedule name> // <Month D, YYYY> // <time>`, e.g. `MNL Grow - Bible Essentials // September 29, 2026 // 7PM`. If the schedule name has no campus marker, prefix `MNL `.
- A Grow viewer's roster window runs from 7 days ago onward. Roster matching goes by schedule, whatever the rostering group.
- Sync: Redis lock with a 600 s TTL, at most 50 creations per run, and it never blocks page load.
- Schedule root category: **171**. Campus roots: 305 MNL, 306 BNE, 307 SEL. Schedule category EntityTypeId is **54**.
- A Rock lookup failure during Grow resolution grants no Grow access (fail closed).
- Versioning: semver minor bump **1.15.1 → 1.16.0**.
- Run tests with `pnpm test -- <path>`, the whole suite with `pnpm test`, and types with `pnpm typecheck`.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| Create `src/lib/scheduleOccurrences.ts` (+ test) | Expand a Rock iCal string into `{date, time}` occurrences |
| Create `src/lib/growRunsheets.ts` (+ test) | Grow constants, title building/matching, next occurrence, missing-title planning |
| Create `src/lib/growAccessPolicy.ts` (+ test) | Pure: memberships + roster → `growEditor` / `growViewer` |
| Create `src/lib/runsheetChannelAccess.ts` (+ test) | Pure: can this session view/edit this channel title |
| Create `src/lib/scheduleCategoryTree.ts` (+ test) | Pure: descendant category IDs, campus root for a campus |
| Create `src/lib/runsheetKind.ts` (+ test) | Pure: Sunday/Youth/Grow/Other classification |
| Create `src/server-actions/internal/rockGrowSchedules.ts` | Fetch active category 483 schedules |
| Create `src/server-actions/rockSyncGrowRunsheets.ts` | Auto-create missing Grow runsheets |
| Modify `src/lib/permissions.ts` (+ test) | Grow roles count toward edit/access gates |
| Modify `src/server-actions/internal/rockResolveAccess.ts` | Resolve Grow roles into `rolesMap` |
| Modify `src/server-actions/runsheetAuthorization.ts` | Edit gate accepts Grow editors on Grow titles |
| Modify `src/server-actions/rockGetAvailableRunsheetChannels.ts` | List filter uses channel access |
| Modify `src/server-actions/rockGetRunsheetDetails.ts` | Detail gate uses channel access |
| Modify `src/server-actions/rockGetScheduleOptions.ts` | ALL EVENTS tree; Grow category returns 483 topics with next date |
| Modify `src/components/runsheet/CreateRunsheetForm.tsx` | Grow-only category restriction, next-date autofill, Grow title |
| Modify `src/components/runsheet/RunsheetManager.tsx` | Fire sync once; pass `growOnly` to the create form |
| Modify `src/components/runsheet/RunsheetLandingView.tsx` | Kind filter pills |
| Modify `src/lib/userPreferences.ts` | Persist the selected kind pill |
| Modify `package.json` | 1.16.0 |

---

### Task 1: iCal occurrence expansion

**Files:**
- Create: `src/lib/scheduleOccurrences.ts`
- Test: `src/lib/scheduleOccurrences.test.ts`

**Interfaces:**
- Produces:
  - `interface ScheduleOccurrence { date: string /* YYYY-MM-DD */; time: string /* e.g. "7PM", "8:30AM" */ }`
  - `formatIcalTime(hhmm: string): string`
  - `expandIcalOccurrences(ical: string, fromDate: string, effectiveEndDate?: string | null, limit?: number): ScheduleOccurrence[]`. The result is sorted, deduplicated by date, contains only dates on or after `fromDate` and on or before the effective end date, and has at most `limit` entries (default 200).

Rock stores these shapes, verified against production:
- `DTSTART:20260808T090000` with `RDATE:20260808T090000` (a single date)
- `DTSTART:20260929T190000` with `RDATE:20261006T190000,20261013T190000,20261020T190000`. DTSTART is **not** repeated in RDATE.
- `DTSTART:20260927T150000` with `RRULE:FREQ=WEEKLY;UNTIL=20261213T000000;BYDAY=SU`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { expandIcalOccurrences, formatIcalTime } from './scheduleOccurrences';

const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

describe('formatIcalTime', () => {
  it('formats whole and half hours', () => {
    expect(formatIcalTime('190000')).toBe('7PM');
    expect(formatIcalTime('083000')).toBe('8:30AM');
    expect(formatIcalTime('120000')).toBe('12PM');
    expect(formatIcalTime('000000')).toBe('12AM');
  });
});

describe('expandIcalOccurrences', () => {
  it('returns a single-date schedule', () => {
    const ical = wrap('DTSTART:20260808T090000\r\nRDATE:20260808T090000');
    expect(expandIcalOccurrences(ical, '2026-08-01')).toEqual([{ date: '2026-08-08', time: '9AM' }]);
  });

  it('includes DTSTART plus every RDATE, skipping past dates', () => {
    const ical = wrap('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000,20261020T190000');
    expect(expandIcalOccurrences(ical, '2026-10-01').map((o) => o.date)).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
    ]);
  });

  it('expands a weekly RRULE until UNTIL', () => {
    const ical = wrap('DTSTART:20260927T150000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261018T000000;BYDAY=SU');
    expect(expandIcalOccurrences(ical, '2026-09-26')).toEqual([
      { date: '2026-09-27', time: '3PM' },
      { date: '2026-10-04', time: '3PM' },
      { date: '2026-10-11', time: '3PM' },
      { date: '2026-10-18', time: '3PM' },
    ]);
  });

  it('honours COUNT, INTERVAL and multi-day BYDAY', () => {
    const ical = wrap('DTSTART:20261005T190000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=MO,WE');
    expect(expandIcalOccurrences(ical, '2026-01-01').map((o) => o.date)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-19',
      '2026-10-21',
    ]);
  });

  it('caps at the effective end date and the limit', () => {
    const ical = wrap('DTSTART:20260927T150000\r\nRRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(expandIcalOccurrences(ical, '2026-09-26', '2026-10-05T00:00:00').map((o) => o.date)).toEqual([
      '2026-09-27',
      '2026-10-04',
    ]);
    expect(expandIcalOccurrences(ical, '2026-09-26', null, 3)).toHaveLength(3);
  });

  it('returns [] for content with no DTSTART', () => {
    expect(expandIcalOccurrences('', '2026-01-01')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/scheduleOccurrences.test.ts`
Expected: FAIL with "Cannot find module './scheduleOccurrences'".

- [ ] **Step 3: Implement**

```ts
/**
 * Expands the iCalendar content Rock stores on a Schedule into concrete
 * occurrence dates. Covers what Rock's schedule editor actually writes:
 * DTSTART, RDATE lists, and WEEKLY/DAILY RRULEs with BYDAY, INTERVAL,
 * UNTIL and COUNT. Dates are handled as plain YYYY-MM-DD strings in UTC
 * arithmetic, so the server timezone never shifts a day.
 */

export interface ScheduleOccurrence {
  date: string;
  time: string;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_RRULE_ITERATIONS = 3660;

/** `"190000"` → `"7PM"`, `"083000"` → `"8:30AM"`. */
export function formatIcalTime(hhmm: string): string {
  const hours = parseInt(hhmm.slice(0, 2), 10) || 0;
  const minutes = parseInt(hhmm.slice(2, 4), 10) || 0;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

function toIsoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function readLines(ical: string, name: string): string[] {
  return ical
    .split(/\r?\n/)
    .filter((line) => line.toUpperCase().startsWith(`${name}:`) || line.toUpperCase().startsWith(`${name};`))
    .map((line) => line.slice(line.indexOf(':') + 1).trim());
}

function parseStamp(value: string): { date: string; time: string } | null {
  const m = value.match(/^(\d{8})(?:T(\d{6}))?/);
  if (!m) return null;
  return { date: toIsoDate(m[1]), time: formatIcalTime(m[2] || '000000') };
}

function expandRrule(rule: string, start: { date: string; time: string }, lastDate: string): ScheduleOccurrence[] {
  const parts = Object.fromEntries(
    rule.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k.toUpperCase(), (v || '').toUpperCase()];
    }),
  );
  const freq = parts.FREQ;
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return [];

  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1);
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : Infinity;
  const until = parts.UNTIL ? toIsoDate(parts.UNTIL) : null;
  const end = until && until < lastDate ? until : lastDate;
  const byDay = (parts.BYDAY ? parts.BYDAY.split(',') : [DAY_CODES[dayOfWeek(start.date)]])
    .map((code: string) => DAY_CODES.indexOf(code.slice(-2)))
    .filter((idx: number) => idx >= 0);

  const out: ScheduleOccurrence[] = [];
  // Weeks are counted from the week containing DTSTART (Sunday-based).
  const weekStart = addDays(start.date, -dayOfWeek(start.date));
  for (let i = 0; i < MAX_RRULE_ITERATIONS && out.length < count; i++) {
    const date = addDays(start.date, i);
    if (date > end) break;
    if (freq === 'DAILY') {
      if (i % interval === 0) out.push({ date, time: start.time });
      continue;
    }
    const weekIndex = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / (7 * 86400000));
    if (weekIndex % interval === 0 && byDay.includes(dayOfWeek(date))) {
      out.push({ date, time: start.time });
    }
  }
  return out;
}

export function expandIcalOccurrences(
  ical: string,
  fromDate: string,
  effectiveEndDate?: string | null,
  limit = 200,
): ScheduleOccurrence[] {
  const start = parseStamp(readLines(ical || '', 'DTSTART')[0] || '');
  if (!start) return [];

  const endFromEffective = effectiveEndDate ? effectiveEndDate.slice(0, 10) : null;
  // Open-ended rules still need a stopping point.
  const lastDate = endFromEffective || addDays(fromDate, 366);

  const all: ScheduleOccurrence[] = [start];
  for (const line of readLines(ical, 'RDATE')) {
    for (const value of line.split(',')) {
      const stamp = parseStamp(value.trim());
      if (stamp) all.push(stamp);
    }
  }
  const rrule = readLines(ical, 'RRULE')[0];
  if (rrule) all.push(...expandRrule(rrule, start, lastDate));

  const byDate = new Map<string, ScheduleOccurrence>();
  for (const occ of all) {
    if (occ.date < fromDate || occ.date > lastDate) continue;
    if (!byDate.has(occ.date)) byDate.set(occ.date, occ);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/scheduleOccurrences.test.ts`
Expected: PASS. If the COUNT/INTERVAL case fails, check that the week index is counted from the Sunday of DTSTART's week.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduleOccurrences.ts src/lib/scheduleOccurrences.test.ts
git commit -m "feat: expand Rock schedule iCal content into occurrences"
```

---

### Task 2: Grow runsheet titles and sync planning

**Files:**
- Create: `src/lib/growRunsheets.ts`
- Test: `src/lib/growRunsheets.test.ts`

**Interfaces:**
- Consumes: `expandIcalOccurrences`, `ScheduleOccurrence` (Task 1); `extractChannelDate` from `src/lib/runsheetDate.ts`; `extractRunsheetCampus` from `src/lib/runsheetCampus.ts`.
- Produces:
  - `GROW_SCHEDULE_CATEGORY_ID = 483`, `GROW_CONTENT_CHANNEL_CATEGORY_ID = 338`, `GROW_TEAM_GROUP_ID = 19108`, `GROW_EDITOR_ROLE_NAMES = ['overall head', 'unit head']`
  - `interface GrowSchedule { id: number; name: string; iCalendarContent: string; effectiveEndDate?: string | null }`
  - `formatWordyDate(isoDate: string): string`, e.g. `"September 29, 2026"`
  - `buildGrowRunsheetTitle(scheduleName: string, isoDate: string, time: string): string`
  - `growOccurrenceKey(scheduleId: number, isoDate: string): string`, e.g. `"477:2026-09-29"`
  - `matchGrowRunsheet(title: string, schedules: GrowSchedule[]): { scheduleId: number; date: string } | null`
  - `nextGrowOccurrence(schedule: GrowSchedule, today: string): ScheduleOccurrence | null`
  - `planMissingGrowRunsheets(schedules: GrowSchedule[], existingTitles: string[], today: string, cap?: number): string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import {
  buildGrowRunsheetTitle,
  growOccurrenceKey,
  matchGrowRunsheet,
  nextGrowOccurrence,
  planMissingGrowRunsheets,
  type GrowSchedule,
} from './growRunsheets';

const wrap = (body: string) => `BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
const essentials: GrowSchedule = {
  id: 477,
  name: 'MNL Grow - Bible Essentials',
  iCalendarContent: wrap('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000'),
  effectiveEndDate: '2026-10-20T00:00:00',
};
const noMarker: GrowSchedule = {
  id: 900,
  name: 'Grow Leaders Huddle',
  iCalendarContent: wrap('DTSTART:20261003T083000'),
};

describe('buildGrowRunsheetTitle', () => {
  it('uses the schedule name, wordy date and time', () => {
    expect(buildGrowRunsheetTitle(essentials.name, '2026-09-29', '7PM')).toBe(
      'MNL Grow - Bible Essentials // September 29, 2026 // 7PM',
    );
  });

  it('prefixes MNL when the schedule name has no campus marker', () => {
    expect(buildGrowRunsheetTitle(noMarker.name, '2026-10-03', '8:30AM')).toBe(
      'MNL Grow Leaders Huddle // October 3, 2026 // 8:30AM',
    );
  });
});

describe('matchGrowRunsheet', () => {
  const schedules = [essentials, noMarker];

  it('matches a title to its schedule and date', () => {
    expect(matchGrowRunsheet('MNL Grow - Bible Essentials // October 6, 2026 // 7PM', schedules)).toEqual({
      scheduleId: 477,
      date: '2026-10-06',
    });
  });

  it('matches case-insensitively and with the MNL prefix added', () => {
    expect(matchGrowRunsheet('mnl grow leaders huddle // October 3, 2026 // 8:30AM', schedules)).toEqual({
      scheduleId: 900,
      date: '2026-10-03',
    });
  });

  it('rejects non-Grow titles and titles without a date', () => {
    expect(matchGrowRunsheet('MNL Crowne // September 27, 2026 // 3PM', schedules)).toBeNull();
    expect(matchGrowRunsheet('MNL Grow - Bible Essentials', schedules)).toBeNull();
  });

  it('fails closed when two schedules share a name', () => {
    expect(
      matchGrowRunsheet('MNL Grow - Bible Essentials // October 6, 2026 // 7PM', [essentials, { ...essentials, id: 478 }]),
    ).toBeNull();
  });
});

describe('nextGrowOccurrence', () => {
  it('returns the first occurrence on or after today', () => {
    expect(nextGrowOccurrence(essentials, '2026-10-01')).toEqual({ date: '2026-10-06', time: '7PM' });
    expect(nextGrowOccurrence(essentials, '2026-12-01')).toBeNull();
  });
});

describe('planMissingGrowRunsheets', () => {
  it('lists missing titles and skips existing ones', () => {
    const existing = ['MNL Grow - Bible Essentials // September 29, 2026 // 7PM'];
    expect(planMissingGrowRunsheets([essentials], existing, '2026-09-26')).toEqual([
      'MNL Grow - Bible Essentials // October 6, 2026 // 7PM',
      'MNL Grow - Bible Essentials // October 13, 2026 // 7PM',
    ]);
  });

  it('treats an existing title with a different time as already present', () => {
    const existing = ['MNL Grow - Bible Essentials // October 6, 2026 // 7:30PM'];
    expect(planMissingGrowRunsheets([essentials], existing, '2026-10-01')).toEqual([
      'MNL Grow - Bible Essentials // October 13, 2026 // 7PM',
    ]);
  });

  it('creates nothing on a second run', () => {
    const first = planMissingGrowRunsheets([essentials], [], '2026-09-26');
    expect(planMissingGrowRunsheets([essentials], first, '2026-09-26')).toEqual([]);
  });

  it('respects the cap', () => {
    expect(planMissingGrowRunsheets([essentials], [], '2026-09-26', 1)).toHaveLength(1);
  });
});

describe('growOccurrenceKey', () => {
  it('joins schedule id and date', () => {
    expect(growOccurrenceKey(477, '2026-09-29')).toBe('477:2026-09-29');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/growRunsheets.test.ts`
Expected: FAIL with "Cannot find module './growRunsheets'".

- [ ] **Step 3: Implement**

```ts
/**
 * Grow Course runsheets: one runsheet per occurrence of each schedule in
 * Rock's "Grow Courses" schedule category. The title is the only link
 * between a runsheet and its schedule/date (Rock returns no categories for
 * runsheet channels), so building and matching titles live together here.
 */
import { extractRunsheetCampus } from './runsheetCampus';
import { extractChannelDate } from './runsheetDate';
import { expandIcalOccurrences, type ScheduleOccurrence } from './scheduleOccurrences';

export const GROW_SCHEDULE_CATEGORY_ID = 483;
export const GROW_CONTENT_CHANNEL_CATEGORY_ID = 338;
export const GROW_TEAM_GROUP_ID = 19108;
export const GROW_EDITOR_ROLE_NAMES = ['overall head', 'unit head'];
export const GROW_SYNC_CAP = 50;

export interface GrowSchedule {
  id: number;
  name: string;
  iCalendarContent: string;
  effectiveEndDate?: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatWordyDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function titlePrefix(scheduleName: string): string {
  const name = scheduleName.trim();
  return extractRunsheetCampus(name) ? name : `MNL ${name}`;
}

export function buildGrowRunsheetTitle(scheduleName: string, isoDate: string, time: string): string {
  return `${titlePrefix(scheduleName)} // ${formatWordyDate(isoDate)} // ${time}`;
}

export function growOccurrenceKey(scheduleId: number, isoDate: string): string {
  return `${scheduleId}:${isoDate}`;
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function matchGrowRunsheet(
  title: string,
  schedules: GrowSchedule[],
): { scheduleId: number; date: string } | null {
  const parts = (title || '').split('//').map((p) => p.trim());
  if (parts.length < 2) return null;
  const date = extractChannelDate(parts[1]);
  if (!date) return null;

  const prefix = normalize(parts[0]);
  const matches = schedules.filter((s) => normalize(titlePrefix(s.name)) === prefix);
  if (matches.length !== 1) return null;
  return { scheduleId: matches[0].id, date: toIsoLocal(date) };
}

export function nextGrowOccurrence(schedule: GrowSchedule, today: string): ScheduleOccurrence | null {
  return expandIcalOccurrences(schedule.iCalendarContent, today, schedule.effectiveEndDate, 1)[0] ?? null;
}

export function planMissingGrowRunsheets(
  schedules: GrowSchedule[],
  existingTitles: string[],
  today: string,
  cap = GROW_SYNC_CAP,
): string[] {
  const existingKeys = new Set(
    existingTitles
      .map((t) => matchGrowRunsheet(t, schedules))
      .filter((m): m is { scheduleId: number; date: string } => m !== null)
      .map((m) => growOccurrenceKey(m.scheduleId, m.date)),
  );

  const titles: string[] = [];
  for (const schedule of schedules) {
    for (const occ of expandIcalOccurrences(schedule.iCalendarContent, today, schedule.effectiveEndDate)) {
      if (titles.length >= cap) return titles;
      const key = growOccurrenceKey(schedule.id, occ.date);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      titles.push(buildGrowRunsheetTitle(schedule.name, occ.date, occ.time));
    }
  }
  return titles;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/growRunsheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growRunsheets.ts src/lib/growRunsheets.test.ts
git commit -m "feat: build and match Grow Course runsheet titles"
```

---

### Task 3: Grow roles in permissions, and channel-level access

**Files:**
- Modify: `src/lib/permissions.ts`
- Create: `src/lib/runsheetChannelAccess.ts`
- Test: `src/lib/permissions.test.ts` (extend), `src/lib/runsheetChannelAccess.test.ts`

**Interfaces:**
- Consumes: `matchGrowRunsheet`, `growOccurrenceKey`, `GrowSchedule` (Task 2); `canAccessRunsheetChannel` (`src/lib/runsheetCampus.ts`).
- Produces:
  - In `permissions.ts`: `GROW_EDITOR_ROLE = 'growEditor'`, `GROW_VIEWER_ROLE = 'growViewer'`, `hasFullEditorRole(user)`, `hasGrowRole(user)`. `canUserEditRunsheet` now returns true for `editor` **or** `growEditor`, and `canUserAccessRunsheet` also accepts `growViewer`.
  - In `runsheetChannelAccess.ts`: `type ChannelAccessSession = { rolesMap?: AuthRolesMap; access?: { runsheetCampuses?: string[] } } | null | undefined`, `canViewRunsheetChannel(session, channelName, growSchedules): boolean`, `canEditRunsheetChannel(session, channelName, growSchedules): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/permissions.test.ts`, inside the existing `describe`, and add `canUserEditRunsheet` and `hasFullEditorRole` to the import:

```ts
  it('treats a Grow editor as able to edit and access', () => {
    const user = { rolesMap: { growEditor: ['19108'] } };
    expect(canUserEditRunsheet(user)).toBe(true);
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(hasFullEditorRole(user)).toBe(false);
  });

  it('treats a Grow viewer as able to access but not edit', () => {
    const user = { rolesMap: { growViewer: ['477:2026-09-29'] } };
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(canUserEditRunsheet(user)).toBe(false);
  });
```

Create `src/lib/runsheetChannelAccess.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { canEditRunsheetChannel, canViewRunsheetChannel } from './runsheetChannelAccess';
import type { GrowSchedule } from './growRunsheets';

const grow: GrowSchedule[] = [{ id: 477, name: 'MNL Grow - Bible Essentials', iCalendarContent: '' }];
const GROW_TITLE = 'MNL Grow - Bible Essentials // September 29, 2026 // 7PM';
const OTHER_GROW = 'MNL Grow - Bible Essentials // October 6, 2026 // 7PM';
const SUNDAY = 'MNL Crowne // September 27, 2026 // 3PM';

describe('canViewRunsheetChannel', () => {
  it('keeps campus access for existing viewers', () => {
    const s = { rolesMap: { viewer: ['1'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
  });

  it('lets a Grow editor view every Grow runsheet but nothing else', () => {
    const s = { rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [] } };
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('lets a rostered viewer see only their occurrence', () => {
    const s = { rolesMap: { growViewer: ['477:2026-09-29'] }, access: { runsheetCampuses: [] } };
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, OTHER_GROW, grow)).toBe(false);
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('denies a session with no roles', () => {
    expect(canViewRunsheetChannel({ rolesMap: {}, access: { runsheetCampuses: ['MNL'] } }, SUNDAY, grow)).toBe(false);
  });
});

describe('canEditRunsheetChannel', () => {
  it('keeps campus editing for existing editors', () => {
    const s = { rolesMap: { editor: ['1'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canEditRunsheetChannel(s, SUNDAY, grow)).toBe(true);
  });

  it('adds Grow editing on top of other access', () => {
    const s = { rolesMap: { viewer: ['1'], growEditor: ['19108'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canEditRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canEditRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('never lets a Grow viewer edit', () => {
    const s = { rolesMap: { growViewer: ['477:2026-09-29'] }, access: { runsheetCampuses: [] } };
    expect(canEditRunsheetChannel(s, GROW_TITLE, grow)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- src/lib/permissions.test.ts src/lib/runsheetChannelAccess.test.ts`
Expected: FAIL. The Grow cases fail, and `runsheetChannelAccess` does not exist yet.

- [ ] **Step 3: Implement**

Replace the body of `src/lib/permissions.ts`:

```ts
import type { AuthRolesMap, AuthUser } from '@/types/AuthUser';

interface HasRolesMap {
  rolesMap?: AuthRolesMap;
}

/** Grow Course Heads: may create/edit Grow runsheets only. */
export const GROW_EDITOR_ROLE = 'growEditor';
/** Rostered Grow volunteers: values are `scheduleId:YYYY-MM-DD` occurrence keys. */
export const GROW_VIEWER_ROLE = 'growViewer';

function hasRole(user: HasRolesMap | AuthUser | null | undefined, role: string): boolean {
  return Boolean(user?.rolesMap?.[role]?.length);
}

/** Campus/global runsheet editor, as opposed to a Grow-only editor. */
export function hasFullEditorRole(user?: HasRolesMap | AuthUser | null): boolean {
  return hasRole(user, 'editor');
}

export function hasGrowRole(user?: HasRolesMap | AuthUser | null): boolean {
  return hasRole(user, GROW_EDITOR_ROLE) || hasRole(user, GROW_VIEWER_ROLE);
}

/**
 * Check if a user has edit access to at least some runsheets. Which channels
 * they may edit is decided per title by `canEditRunsheetChannel`.
 */
export function canUserEditRunsheet(user?: HasRolesMap | AuthUser | null): boolean {
  return hasFullEditorRole(user) || hasRole(user, GROW_EDITOR_ROLE);
}

/**
 * Check if a user is eligible to view or access runsheets.
 * If user has no assigned roles/permissions, returns false so they can be gated.
 */
export function canUserAccessRunsheet(user?: HasRolesMap | AuthUser | null): boolean {
  return canUserEditRunsheet(user) || hasRole(user, 'viewer') || hasRole(user, GROW_VIEWER_ROLE);
}
```

Create `src/lib/runsheetChannelAccess.ts`:

```ts
/**
 * Per-channel runsheet access. Campus rules (viewer/editor + campus scope)
 * are checked first and are unchanged; Grow rules only ever add access to
 * channels whose title matches a Grow Courses schedule.
 */
import type { AuthRolesMap } from '@/types/AuthUser';
import { canAccessRunsheetChannel } from './runsheetCampus';
import { growOccurrenceKey, matchGrowRunsheet, type GrowSchedule } from './growRunsheets';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE } from './permissions';

export type ChannelAccessSession = {
  rolesMap?: AuthRolesMap;
  access?: { runsheetCampuses?: string[] };
} | null | undefined;

const has = (s: ChannelAccessSession, role: string) => Boolean(s?.rolesMap?.[role]?.length);

export function canViewRunsheetChannel(
  session: ChannelAccessSession,
  channelName: string,
  growSchedules: GrowSchedule[],
): boolean {
  if ((has(session, 'editor') || has(session, 'viewer')) &&
      canAccessRunsheetChannel(session?.access?.runsheetCampuses, channelName)) {
    return true;
  }
  if (!has(session, GROW_EDITOR_ROLE) && !has(session, GROW_VIEWER_ROLE)) return false;

  const match = matchGrowRunsheet(channelName, growSchedules);
  if (!match) return false;
  if (has(session, GROW_EDITOR_ROLE)) return true;
  return (session?.rolesMap?.[GROW_VIEWER_ROLE] || []).includes(growOccurrenceKey(match.scheduleId, match.date));
}

export function canEditRunsheetChannel(
  session: ChannelAccessSession,
  channelName: string,
  growSchedules: GrowSchedule[],
): boolean {
  if (has(session, 'editor') && canAccessRunsheetChannel(session?.access?.runsheetCampuses, channelName)) {
    return true;
  }
  return has(session, GROW_EDITOR_ROLE) && matchGrowRunsheet(channelName, growSchedules) !== null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test -- src/lib/permissions.test.ts src/lib/runsheetChannelAccess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions.test.ts src/lib/runsheetChannelAccess.ts src/lib/runsheetChannelAccess.test.ts
git commit -m "feat: add Grow editor and viewer runsheet roles"
```

---

### Task 4: Resolve Grow access from Rock

**Files:**
- Create: `src/lib/growAccessPolicy.ts`
- Test: `src/lib/growAccessPolicy.test.ts`
- Create: `src/server-actions/internal/rockGrowSchedules.ts`
- Modify: `src/server-actions/internal/rockResolveAccess.ts`, adding functions after `fetchGroupType23LeaderRoleIds` and the Grow block after the `for (const campus of policy.runsheetCampuses)` line.

**Interfaces:**
- Consumes: `GROW_TEAM_GROUP_ID`, `GROW_EDITOR_ROLE_NAMES`, `GROW_SCHEDULE_CATEGORY_ID`, `growOccurrenceKey`, `GrowSchedule` (Task 2); `GROW_EDITOR_ROLE`, `GROW_VIEWER_ROLE` (Task 3); `rockGet` from `rockFetch`.
- Produces:
  - `resolveGrowAccess(input: { memberships: Array<{ groupId: number; groupRoleId?: number }>; roleNamesById: ReadonlyMap<number, string>; rostered: Array<{ scheduleId: number; occurrenceDate: string }>; growScheduleIds: ReadonlySet<number> }): { growEditor: boolean; growViewer: string[] }`
  - `fetchGrowSchedules(): Promise<GrowSchedule[]>` (server-only)
  - In the session: `rolesMap.growEditor = ['19108']` and `rolesMap.growViewer = [keys]`

The Rock query shapes were verified against production on 2026-09-26:
- `/PersonAlias?$filter=PersonId eq X` returns `Id`.
- `/Attendances?$filter=PersonAliasId eq A and ScheduledToAttend eq true and StartDateTime ge datetime'YYYY-MM-DDT00:00:00'&$select=OccurrenceId` works.
- `/AttendanceOccurrences?$filter=Id eq N or ...&$select=Id,ScheduleId,OccurrenceDate` works.
- `Attendance` has **no** `Occurrence` navigation property. Do not `$expand` it.
- `/GroupTypeRoles?$filter=GroupTypeId eq 23&$select=Id,Name` returns Overall Head = 20 and Unit Head = 55.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { resolveGrowAccess } from './growAccessPolicy';

const roleNamesById = new Map([[19, 'Member'], [20, 'Overall Head'], [55, 'Unit Head']]);
const growScheduleIds = new Set([477, 752]);

describe('resolveGrowAccess', () => {
  it('makes Overall Head and Unit Head in 19108 Grow editors', () => {
    for (const groupRoleId of [20, 55]) {
      expect(
        resolveGrowAccess({ memberships: [{ groupId: 19108, groupRoleId }], roleNamesById, rostered: [], growScheduleIds })
          .growEditor,
      ).toBe(true);
    }
  });

  it('does not make a Member or a Head of another team a Grow editor', () => {
    const result = resolveGrowAccess({
      memberships: [{ groupId: 19108, groupRoleId: 19 }, { groupId: 19095, groupRoleId: 20 }],
      roleNamesById,
      rostered: [],
      growScheduleIds,
    });
    expect(result).toEqual({ growEditor: false, growViewer: [] });
  });

  it('keeps only rostered occurrences of Grow schedules', () => {
    const result = resolveGrowAccess({
      memberships: [],
      roleNamesById,
      rostered: [
        { scheduleId: 477, occurrenceDate: '2026-09-29T00:00:00' },
        { scheduleId: 477, occurrenceDate: '2026-09-29T00:00:00' },
        { scheduleId: 311, occurrenceDate: '2026-09-27T00:00:00' },
      ],
      growScheduleIds,
    });
    expect(result.growViewer).toEqual(['477:2026-09-29']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/growAccessPolicy.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the pure policy**

```ts
/** Pure Grow Course access rules; Rock fetching lives in rockResolveAccess. */
import { GROW_EDITOR_ROLE_NAMES, GROW_TEAM_GROUP_ID, growOccurrenceKey } from './growRunsheets';

export interface GrowAccessInput {
  memberships: Array<{ groupId: number; groupRoleId?: number }>;
  roleNamesById: ReadonlyMap<number, string>;
  rostered: Array<{ scheduleId: number; occurrenceDate: string }>;
  growScheduleIds: ReadonlySet<number>;
}

export function resolveGrowAccess(input: GrowAccessInput): { growEditor: boolean; growViewer: string[] } {
  const growEditor = input.memberships.some(
    (m) =>
      m.groupId === GROW_TEAM_GROUP_ID &&
      GROW_EDITOR_ROLE_NAMES.includes((input.roleNamesById.get(Number(m.groupRoleId)) || '').trim().toLowerCase()),
  );

  const growViewer = [
    ...new Set(
      input.rostered
        .filter((r) => input.growScheduleIds.has(r.scheduleId))
        .map((r) => growOccurrenceKey(r.scheduleId, r.occurrenceDate.slice(0, 10))),
    ),
  ];

  return { growEditor, growViewer };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/growAccessPolicy.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the schedule fetcher**

Create `src/server-actions/internal/rockGrowSchedules.ts`:

```ts
import 'server-only';

import { GROW_SCHEDULE_CATEGORY_ID, type GrowSchedule } from '@/lib/growRunsheets';
import { rockGet } from '@/server-actions/internal/rockFetch';

/** Active schedules in Rock's "Grow Courses" category; each one is a topic. */
export async function fetchGrowSchedules(): Promise<GrowSchedule[]> {
  const rows = (await rockGet('/Schedules', {
    $filter: `CategoryId eq ${GROW_SCHEDULE_CATEGORY_ID} and IsActive eq true`,
    $select: 'Id,Name,iCalendarContent,EffectiveEndDate',
    $orderby: 'Name asc',
  })) as Array<{ Id: number; Name: string; iCalendarContent?: string; EffectiveEndDate?: string | null }> | null;

  return (rows || []).map((r) => ({
    id: Number(r.Id),
    name: r.Name,
    iCalendarContent: r.iCalendarContent || '',
    effectiveEndDate: r.EffectiveEndDate ?? null,
  }));
}
```

- [ ] **Step 6: Wire it into `rockResolveAccess`**

Add these imports at the top of `src/server-actions/internal/rockResolveAccess.ts`:

```ts
import { resolveGrowAccess } from '@/lib/growAccessPolicy';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE } from '@/lib/permissions';
import { GROW_TEAM_GROUP_ID } from '@/lib/growRunsheets';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
```

Add these functions after `fetchGroupType23LeaderRoleIds`:

```ts
async function fetchGroupType23RoleNames(): Promise<Map<number, string>> {
  const roles = (await rawRockGet('/GroupTypeRoles', {
    $filter: 'GroupTypeId eq 23',
    $select: 'Id,Name',
    $top: 100,
  })) || [];
  return new Map((roles as any[]).map((r) => [Number(r.Id), String(r.Name || '')]));
}

function manilaDateDaysAgo(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const orFilter = (field: string, ids: number[]) => ids.map((id) => `${field} eq ${id}`).join(' or ');

/** Scheduler assignments (any rostering group) from 7 days ago onward. */
async function fetchRosteredOccurrences(personIds: number[]): Promise<Array<{ scheduleId: number; occurrenceDate: string }>> {
  const aliases = (await rawRockGet('/PersonAlias', {
    $filter: orFilter('PersonId', personIds),
    $select: 'Id',
    $top: 100,
  })) || [];
  const aliasIds = (aliases as any[]).map((a) => Number(a.Id)).filter((id) => id > 0);
  if (aliasIds.length === 0) return [];

  const attendances = (await rawRockGet('/Attendances', {
    $filter: `(${orFilter('PersonAliasId', aliasIds)}) and ScheduledToAttend eq true and StartDateTime ge datetime'${manilaDateDaysAgo(7)}T00:00:00'`,
    $select: 'OccurrenceId',
    $top: 500,
  })) || [];
  const occurrenceIds = [...new Set((attendances as any[]).map((a) => Number(a.OccurrenceId)).filter((id) => id > 0))];
  if (occurrenceIds.length === 0) return [];

  const occurrences = (await rawRockGet('/AttendanceOccurrences', {
    $filter: orFilter('Id', occurrenceIds),
    $select: 'Id,ScheduleId,OccurrenceDate',
    $top: 500,
  })) || [];
  return (occurrences as any[])
    .filter((o) => o.ScheduleId != null && o.OccurrenceDate)
    .map((o) => ({ scheduleId: Number(o.ScheduleId), occurrenceDate: String(o.OccurrenceDate) }));
}
```

In `rockResolveAccess`, directly after `for (const campus of policy.runsheetCampuses) runsheetCampuses.add(campus);`, and still inside the `if (membershipPersonIds.length > 0)` block, add:

```ts
    // Grow Course access only ever adds to the roles above. Any Rock
    // failure here grants no Grow access rather than failing the session.
    try {
      const inGrowTeam = memberships.some((m: any) => Number(m.GroupId) === GROW_TEAM_GROUP_ID);
      const [roleNamesById, rostered, growSchedules] = await Promise.all([
        inGrowTeam ? fetchGroupType23RoleNames() : Promise.resolve(new Map<number, string>()),
        fetchRosteredOccurrences(membershipPersonIds),
        fetchGrowSchedules(),
      ]);
      const grow = resolveGrowAccess({
        memberships: memberships.map((m: any) => ({
          groupId: Number(m.GroupId ?? m.groupId),
          groupRoleId: Number(m.GroupRoleId ?? m.groupRoleId),
        })),
        roleNamesById,
        rostered,
        growScheduleIds: new Set(growSchedules.map((s) => s.id)),
      });
      if (grow.growEditor) rolesMap[GROW_EDITOR_ROLE] = [String(GROW_TEAM_GROUP_ID)];
      if (grow.growViewer.length > 0) rolesMap[GROW_VIEWER_ROLE] = grow.growViewer;
    } catch (error) {
      console.warn('[runsheet-access] Grow access lookup failed; granting no Grow access', error);
    }
```

The existing "Deduplicate group IDs" loop runs after this block and deduplicates the new keys too.

- [ ] **Step 7: Run the access tests**

Run: `pnpm test -- src/server-actions/internal/rockResolveAccess.test.ts src/lib/growAccessPolicy.test.ts`
Expected: PASS. If an existing resolver test fails because its fetch mock returns an unexpected shape for `/PersonAlias`, `/Attendances`, `/AttendanceOccurrences`, `/Schedules` or `/GroupTypeRoles`:
- Extend that test's mock to return `[]` for those paths.
- If a test asserts the exact `rolesMap`, confirm the Grow keys are absent when the mock returns `[]`.

Do not weaken any existing assertion.

- [ ] **Step 8: Commit**

```bash
git add src/lib/growAccessPolicy.ts src/lib/growAccessPolicy.test.ts src/server-actions/internal/rockGrowSchedules.ts src/server-actions/internal/rockResolveAccess.ts src/server-actions/internal/rockResolveAccess.test.ts
git commit -m "feat: resolve Grow Course editor and roster access from Rock"
```

---

### Task 5: Enforce channel access in server actions

**Files:**
- Modify: `src/server-actions/runsheetAuthorization.ts` (`assertRunsheetEditAccess`)
- Modify: `src/server-actions/rockGetAvailableRunsheetChannels.ts:93`
- Modify: `src/server-actions/rockGetRunsheetDetails.ts:187`
- Test: `src/server-actions/runsheetAccessBehavior.test.ts` (extend)

**Interfaces:**
- Consumes: `canViewRunsheetChannel`, `canEditRunsheetChannel` (Task 3); `fetchGrowSchedules` (Task 4); `hasGrowRole` (Task 3).
- Produces: behaviour only. Grow schedules are fetched **only** when the session has a Grow role, so existing sessions make no new Rock calls.

- [ ] **Step 1: Write the failing tests**

Add to `src/server-actions/runsheetAccessBehavior.test.ts`. Reuse its existing mocks (`mockGetRockSession`, `mockRockGet`). The `/Schedules` path is what `fetchGrowSchedules` calls through the mocked `rockGet`.

```ts
describe('Grow Course access', () => {
  const growSchedulesResponse = [
    { Id: 477, Name: 'MNL Grow - Bible Essentials', iCalendarContent: '', EffectiveEndDate: null },
  ];
  const channels = [
    { Id: 901, Name: 'MNL Grow - Bible Essentials // December 29, 2099 // 7PM' },
    { Id: 902, Name: 'MNL Grow - Bible Essentials // December 22, 2099 // 7PM' },
    { Id: 903, Name: 'MNL Crowne // December 27, 2099 // 3PM' },
  ];

  function routeRockGet() {
    mockRockGet.mockImplementation((async (url: string) => {
      if (url === '/Schedules') return growSchedulesResponse;
      if (url === '/ContentChannels') return channels;
      if (url === '/ContentChannels/903') return { Id: 903, Name: channels[2].Name, ContentChannelTypeId: 13 };
      if (url === '/ContentChannels/901') return { Id: 901, Name: channels[0].Name, ContentChannelTypeId: 13 };
      return [];
    }) as any);
  }

  it('lists only the rostered occurrence for a Grow viewer', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue({
      rolesMap: { growViewer: ['477:2099-12-29'] },
      access: { runsheetCampuses: [] },
    } as any);
    const res = await rockGetAvailableRunsheetChannels();
    expect(res.channels.map((c) => c.id)).toEqual([901]);
  });

  it('lets a Grow editor list every Grow runsheet but not Sunday ones', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue({
      rolesMap: { growEditor: ['19108'] },
      access: { runsheetCampuses: [] },
    } as any);
    const res = await rockGetAvailableRunsheetChannels();
    expect(res.channels.map((c) => c.id).sort()).toEqual([901, 902]);
  });

  it('denies a Grow editor writing to a Sunday runsheet', async () => {
    routeRockGet();
    mockGetRockSession.mockResolvedValue({
      rolesMap: { growEditor: ['19108'] },
      access: { runsheetCampuses: [] },
    } as any);
    const res = await rockDeleteServiceRunsheet(903);
    expect(res.success).toBe(false);
    expectNoRockWrites();
  });
});
```

If `rockDeleteServiceRunsheet`'s signature differs, call it the same way the existing delete test in this file does.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- src/server-actions/runsheetAccessBehavior.test.ts`
Expected: the new Grow cases FAIL, because the list returns nothing and the edit is denied for the wrong reason or allowed.

- [ ] **Step 3: Update `assertRunsheetEditAccess`**

In `src/server-actions/runsheetAuthorization.ts`, add these imports:

```ts
import { hasGrowRole } from '@/lib/permissions';
import { canEditRunsheetChannel } from '@/lib/runsheetChannelAccess';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
```

Then replace the campus check inside the `try`:

```ts
    if (!channelName) return { allowed: false, error: CAMPUS_DENIAL };

    // Campus editors pass without the Grow schedule lookup.
    if (canEditRunsheetChannel(session, channelName, [])) {
      return { allowed: true, channelName };
    }

    // Grow editors are checked against the Grow Courses schedules only when
    // they hold a Grow role, so ordinary sessions make no extra Rock call.
    if (hasGrowRole(session) && canEditRunsheetChannel(session, channelName, await fetchGrowSchedules())) {
      return { allowed: true, channelName };
    }

    return { allowed: false, error: CAMPUS_DENIAL };
```

- [ ] **Step 4: Update the channel list**

In `rockGetAvailableRunsheetChannels.ts`, add these imports:

```ts
import { hasGrowRole } from '@/lib/permissions';
import { canViewRunsheetChannel } from '@/lib/runsheetChannelAccess';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
```

Then replace the campus-isolation line at `:93`:

```ts
    // Campus isolation applies to everyone; Grow roles add Grow Course
    // channels on top (see lib/runsheetChannelAccess).
    const growSchedules = hasGrowRole(session) ? await fetchGrowSchedules() : [];
    available = available.filter((c) => canViewRunsheetChannel(session, c.Name, growSchedules));
```

- [ ] **Step 5: Update the detail gate**

In `rockGetRunsheetDetails.ts`, add the same three imports, then replace the check at `:187`:

```ts
    const growSchedules = hasGrowRole(session) ? await fetchGrowSchedules() : [];
    if (!canViewRunsheetChannel(session, channel.Name, growSchedules)) {
      return { success: false, error: 'You do not have access to this runsheet.' };
    }
```

Remove the now-unused `canAccessRunsheetChannel` imports from `rockGetRunsheetDetails.ts`, `rockGetAvailableRunsheetChannels.ts` and `runsheetAuthorization.ts` if lint flags them.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm test -- src/server-actions && pnpm typecheck`
Expected: PASS for the new and all existing server-action tests, with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/server-actions/runsheetAuthorization.ts src/server-actions/rockGetAvailableRunsheetChannels.ts src/server-actions/rockGetRunsheetDetails.ts src/server-actions/runsheetAccessBehavior.test.ts
git commit -m "feat: enforce Grow Course access on runsheet list, detail and writes"
```

---

### Task 6: Broaden schedule fetching; Grow topics with next date

**Files:**
- Create: `src/lib/scheduleCategoryTree.ts`
- Test: `src/lib/scheduleCategoryTree.test.ts`
- Modify: `src/server-actions/rockGetScheduleOptions.ts`

**Interfaces:**
- Consumes: `expandIcalOccurrences` (Task 1); `GROW_CONTENT_CHANNEL_CATEGORY_ID`, `nextGrowOccurrence` (Task 2); `fetchGrowSchedules` (Task 4); `RunsheetCampusCode`.
- Produces:
  - `ALL_EVENTS_CATEGORY_ID = 171`, `CAMPUS_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number>`
  - `descendantCategoryIds(categories: Array<{ id: number; parentId: number | null }>, rootId: number): number[]` (includes the root)
  - `scheduleRootForCampus(campus: RunsheetCampusCode | null): number`
  - `ScheduleOption` gains `nextDate?: string`. For Grow schedules, `timeLabel` comes from the next occurrence.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { descendantCategoryIds, scheduleRootForCampus } from './scheduleCategoryTree';

const tree = [
  { id: 171, parentId: null },
  { id: 305, parentId: 171 },
  { id: 306, parentId: 171 },
  { id: 483, parentId: 305 },
  { id: 999, parentId: 483 },
  { id: 400, parentId: 306 },
  { id: 12, parentId: null },
];

describe('descendantCategoryIds', () => {
  it('walks the whole subtree including the root', () => {
    expect(descendantCategoryIds(tree, 305).sort((a, b) => a - b)).toEqual([305, 483, 999]);
    expect(descendantCategoryIds(tree, 171)).toHaveLength(6);
  });

  it('survives a cycle', () => {
    expect(descendantCategoryIds([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }], 1).sort()).toEqual([1, 2]);
  });
});

describe('scheduleRootForCampus', () => {
  it('maps campuses to their roots and falls back to ALL EVENTS', () => {
    expect(scheduleRootForCampus('MNL')).toBe(305);
    expect(scheduleRootForCampus('BNE')).toBe(306);
    expect(scheduleRootForCampus('SEL')).toBe(307);
    expect(scheduleRootForCampus(null)).toBe(171);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/scheduleCategoryTree.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the tree helpers**

```ts
/** Rock's schedule category tree: ALL EVENTS (171) → campus roots → event folders. */
import type { RunsheetCampusCode } from './runsheetCampus';

export const ALL_EVENTS_CATEGORY_ID = 171;
export const SCHEDULE_CATEGORY_ENTITY_TYPE_ID = 54;
export const CAMPUS_SCHEDULE_ROOT_IDS: Record<RunsheetCampusCode, number> = { MNL: 305, BNE: 306, SEL: 307 };

export function descendantCategoryIds(
  categories: Array<{ id: number; parentId: number | null }>,
  rootId: number,
): number[] {
  const children = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parentId == null) continue;
    children.set(c.parentId, [...(children.get(c.parentId) || []), c.id]);
  }
  const seen = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) || []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...seen];
}

export function scheduleRootForCampus(campus: RunsheetCampusCode | null): number {
  return campus ? CAMPUS_SCHEDULE_ROOT_IDS[campus] : ALL_EVENTS_CATEGORY_ID;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/scheduleCategoryTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the schedule fetching in `rockGetScheduleOptions.ts`**

1. Delete `CATEGORY_SCHEDULE_MAP`.
2. Add `nextDate?: string;` to `ScheduleOption`.
3. Add these imports:

```ts
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID, nextGrowOccurrence } from '@/lib/growRunsheets';
import { expandIcalOccurrences } from '@/lib/scheduleOccurrences';
import {
  descendantCategoryIds,
  scheduleRootForCampus,
  SCHEDULE_CATEGORY_ENTITY_TYPE_ID,
} from '@/lib/scheduleCategoryTree';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
```

4. Add this helper above `rockGetScheduleOptions`:

```ts
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}
```

5. Directly after the access check, add the Grow branch:

```ts
    // Grow Class runsheets are one per Grow Courses topic occurrence; the
    // form autofills the topic's next date from `nextDate`.
    if (categoryId === GROW_CONTENT_CHANNEL_CATEGORY_ID) {
      const today = manilaToday();
      const schedules: ScheduleOption[] = [];
      for (const s of await fetchGrowSchedules()) {
        const next = nextGrowOccurrence(s, today);
        if (!next) continue;
        schedules.push({ id: s.id, name: s.name, categoryId: 483, timeLabel: next.time, nextDate: next.date });
      }
      schedules.sort((a, b) => (a.nextDate || '').localeCompare(b.nextDate || ''));
      return { success: true, schedules };
    }
```

6. Replace the `targetCategoryIds` / `filterClause` / `rawSchedules` block:

```ts
    const [categoryRows, contentCategory] = await Promise.all([
      rockGet('/Categories', {
        $filter: `EntityTypeId eq ${SCHEDULE_CATEGORY_ENTITY_TYPE_ID}`,
        $select: 'Id,ParentCategoryId',
        $top: 1000,
      }) as Promise<Array<{ Id: number; ParentCategoryId: number | null }> | null>,
      categoryId
        ? (rockGet(`/Categories/${categoryId}`) as Promise<{ Name?: string } | null>)
        : Promise.resolve(null),
    ]);

    const campus = contentCategory?.Name ? extractRunsheetCampus(contentCategory.Name.replace(/\|/g, ' ')) : null;
    const targetCategoryIds = descendantCategoryIds(
      (categoryRows || []).map((c) => ({ id: Number(c.Id), parentId: c.ParentCategoryId ?? null })),
      scheduleRootForCampus(campus),
    );

    const rawSchedules = (await rockGet('/Schedules', {
      $filter: `IsActive eq true and (${targetCategoryIds.map((id) => `CategoryId eq ${id}`).join(' or ')})`,
      $select: 'Id,Name,CategoryId,iCalendarContent,WeeklyDayOfWeek,EffectiveStartDate,EffectiveEndDate',
      $orderby: 'Name asc',
    })) as Array<{
      Id: number;
      Name: string;
      CategoryId: number;
      iCalendarContent?: string;
      WeeklyDayOfWeek?: number;
      EffectiveStartDate?: string;
      EffectiveEndDate?: string;
    }> | null;
```

7. Replace `const isYouthCategory = categoryId === 341 || categoryId === 344;` with:

```ts
    const isYouthCategory = /youth/i.test(contentCategory?.Name || '');
```

8. Before step 3 of the existing filter (`// 3. Active Schedule Filtering ...`), insert the "hasn't happened yet" rule:

```ts
    // Only schedules that still have an occurrence from today onward.
    const today = manilaToday();
    list = list.filter(
      (s) => !s.iCalendarContent || expandIcalOccurrences(s.iCalendarContent, today, s.EffectiveEndDate, 1).length > 0,
    );
```

9. Keep the rest of the existing date/day-of-week filter and the mapping unchanged.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm test -- src/server-actions src/lib && pnpm typecheck`
Expected: PASS. If an existing `rockGetScheduleOptions` access test mocks `rockGet` with a single array response, the new `/Categories` call receives that array too. Make sure the test still asserts its denial or allowance correctly, and extend its mock to route by URL if needed.

- [ ] **Step 7: Check against Rock by hand (read-only)**

Run `pnpm dev`, sign in as a global editor, open **Create**, and choose:
- **MNL | Sunday Service**: the Sunday schedules are listed.
- **MNL | Grow Class**: Grow topics are listed.
- **BNE | Sunday Service**: only Brisbane schedules are listed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/scheduleCategoryTree.ts src/lib/scheduleCategoryTree.test.ts src/server-actions/rockGetScheduleOptions.ts
git commit -m "feat: fetch schedule options from the whole ALL EVENTS tree"
```

---

### Task 7: Create form, with Grow-only categories and next-date autofill

**Files:**
- Modify: `src/components/runsheet/CreateRunsheetForm.tsx`
- Modify: `src/components/runsheet/RunsheetManager.tsx` (the place that renders `<CreateRunsheetForm`)

**Interfaces:**
- Consumes: `ScheduleOption.nextDate` (Task 6); `buildGrowRunsheetTitle`, `GROW_CONTENT_CHANNEL_CATEGORY_ID` (Task 2); `hasFullEditorRole` (Task 3).
- Produces: a new `growOnly?: boolean` prop on `CreateRunsheetForm`.

- [ ] **Step 1: Add the prop and restrict categories**

In `CreateRunsheetFormProps`, add `growOnly?: boolean;`, and destructure it in the component signature. In `loadOptions`, after `let filteredCats = res.categories;` and the existing campus filter, add:

```ts
          // A Grow-only editor may create Grow Class runsheets only.
          if (growOnly) {
            filteredCats = filteredCats.filter((cat) => cat.id === GROW_CONTENT_CHANNEL_CATEGORY_ID);
          }
```

Add the import:

```ts
import { buildGrowRunsheetTitle, GROW_CONTENT_CHANNEL_CATEGORY_ID } from '@/lib/growRunsheets';
```

- [ ] **Step 2: Autofill the next date when a Grow topic is picked**

Add this effect after the `loadSchedules` effect:

```ts
  // Grow topics carry their next occurrence; jump the date to it.
  useEffect(() => {
    if (selectedCategoryId !== GROW_CONTENT_CHANNEL_CATEGORY_ID) return;
    const next = schedules.find((s) => s.name === session)?.nextDate;
    if (next && next !== date) setDate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, schedules, selectedCategoryId]);
```

- [ ] **Step 3: Use the shared Grow title builder**

In the title effect (the one that calls `generateRunsheetTitle` and `setTitle(autoTitle)`), branch before the existing call:

```ts
    if (selectedCategoryId === GROW_CONTENT_CHANNEL_CATEGORY_ID && selectedSchedule) {
      setTitle(buildGrowRunsheetTitle(selectedSchedule.name, date, selectedSchedule.timeLabel));
      return;
    }
```

This keeps titles made in the form identical to the ones sync creates, so sync never duplicates them.

- [ ] **Step 4: Pass `growOnly` from `RunsheetManager`**

Add `hasFullEditorRole` to the existing `@/lib/permissions` import. Wherever `<CreateRunsheetForm` is rendered, add:

```tsx
growOnly={!hasFullEditorRole(user)}
```

- [ ] **Step 5: Typecheck and check by hand**

Run: `pnpm typecheck`
Expected: no errors.

Run `pnpm dev`, then:
- As a global editor, choose **MNL | Grow Class** and then **MNL Grow - Bible Essentials**. The date jumps to the next upcoming date, and the title reads `MNL Grow - Bible Essentials // <date> // 7PM`.
- Do **not** press Create against production. Cancel.

- [ ] **Step 6: Commit**

```bash
git add src/components/runsheet/CreateRunsheetForm.tsx src/components/runsheet/RunsheetManager.tsx
git commit -m "feat: autofill Grow Class runsheets to the topic's next date"
```

---

### Task 8: Auto-create Grow runsheets on load

**Files:**
- Create: `src/server-actions/rockSyncGrowRunsheets.ts`
- Test: `src/server-actions/rockSyncGrowRunsheets.test.ts`
- Modify: `src/components/runsheet/RunsheetManager.tsx`

**Interfaces:**
- Consumes: `planMissingGrowRunsheets`, `GROW_CONTENT_CHANNEL_CATEGORY_ID` (Task 2); `fetchGrowSchedules` (Task 4); `canUserEditRunsheet` (Task 3); `rockCreateServiceRunsheet(title, 13, categoryId)` (existing); `redisCommand`, `isRedisEnabled` (existing `internal/redisClient`).
- Produces: `rockSyncGrowRunsheets(): Promise<{ success: boolean; created: number; error?: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { redisCommand, isRedisEnabled } from '@/server-actions/internal/redisClient';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';
import { rockSyncGrowRunsheets, resetGrowSyncLockForTests } from './rockSyncGrowRunsheets';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/server-actions/internal/redisClient', () => ({ redisCommand: jest.fn(), isRedisEnabled: jest.fn() }));
jest.mock('./rockCreateServiceRunsheet', () => ({ rockCreateServiceRunsheet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockGet = jest.mocked(rockGet);
const mockCreate = jest.mocked(rockCreateServiceRunsheet);
const mockRedisEnabled = jest.mocked(isRedisEnabled);

const ical = 'BEGIN:VEVENT\r\nDTSTART:20991006T190000\r\nRDATE:20991013T190000\r\nEND:VEVENT';

beforeEach(() => {
  jest.resetAllMocks();
  resetGrowSyncLockForTests();
  mockRedisEnabled.mockReturnValue(false);
  mockCreate.mockResolvedValue({ success: true, id: 1 } as any);
  mockGet.mockImplementation((async (url: string) => {
    if (url === '/Schedules') return [{ Id: 477, Name: 'MNL Grow - Bible Essentials', iCalendarContent: ical }];
    if (url === '/ContentChannels') return [{ Name: 'MNL Grow - Bible Essentials // October 6, 2099 // 7PM' }];
    return [];
  }) as any);
});

describe('rockSyncGrowRunsheets', () => {
  it('does nothing for a user who cannot edit', async () => {
    mockSession.mockResolvedValue({ rolesMap: { viewer: ['1'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('creates only the missing occurrence in category 338', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 1 });
    expect(mockCreate).toHaveBeenCalledWith('MNL Grow - Bible Essentials // October 13, 2099 // 7PM', 13, 338);
  });

  it('skips while another sync holds the lock', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    await rockSyncGrowRunsheets();
    mockCreate.mockClear();
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('uses Redis SET NX when Redis is enabled', async () => {
    mockRedisEnabled.mockReturnValue(true);
    jest.mocked(redisCommand).mockResolvedValue(null as any);
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    expect(await rockSyncGrowRunsheets()).toEqual({ success: true, created: 0 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/server-actions/rockSyncGrowRunsheets.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```ts
'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserEditRunsheet } from '@/lib/permissions';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID, planMissingGrowRunsheets } from '@/lib/growRunsheets';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
import { isRedisEnabled, redisCommand } from '@/server-actions/internal/redisClient';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;
const LOCK_KEY = 'runsheet:grow-sync';
const LOCK_TTL_SECONDS = 600;

let memoryLockUntil = 0;

/** Test hook: clears the in-memory lock used when Redis is not configured. */
export async function resetGrowSyncLockForTests(): Promise<void> {
  memoryLockUntil = 0;
}

async function acquireLock(): Promise<boolean> {
  if (isRedisEnabled()) {
    return (await redisCommand<string>(['SET', LOCK_KEY, '1', 'NX', 'EX', LOCK_TTL_SECONDS])) === 'OK';
  }
  const now = Date.now();
  if (now < memoryLockUntil) return false;
  memoryLockUntil = now + LOCK_TTL_SECONDS * 1000;
  return true;
}

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

/**
 * Creates a runsheet for every upcoming Grow Courses occurrence that has
 * none yet. Fired from the runsheet list on load; safe to call repeatedly.
 * Each creation goes through rockCreateServiceRunsheet, so the caller's
 * edit access is re-checked per title.
 */
export async function rockSyncGrowRunsheets(): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    const session = await getRockSession();
    if (!canUserEditRunsheet(session)) return { success: true, created: 0 };
    if (!(await acquireLock())) return { success: true, created: 0 };

    const [schedules, channels] = await Promise.all([
      fetchGrowSchedules(),
      rockGet('/ContentChannels', {
        $filter: `ContentChannelTypeId eq ${RUNSHEET_CONTENT_CHANNEL_TYPE_ID}`,
        $select: 'Name',
        $top: 5000,
      }, true) as Promise<Array<{ Name: string }> | null>,
    ]);

    const titles = planMissingGrowRunsheets(schedules, (channels || []).map((c) => c.Name), manilaToday());

    let created = 0;
    for (const title of titles) {
      try {
        const res = await rockCreateServiceRunsheet(title, RUNSHEET_CONTENT_CHANNEL_TYPE_ID, GROW_CONTENT_CHANNEL_CATEGORY_ID);
        if (res.success) created++;
        else console.warn(`[grow-sync] could not create "${title}": ${res.error}`);
      } catch (error) {
        console.warn(`[grow-sync] could not create "${title}"`, error);
      }
    }
    return { success: true, created };
  } catch (error) {
    console.error('[grow-sync] failed', error);
    return { success: false, created: 0, error: 'Grow runsheet sync failed.' };
  }
}
```

A `'use server'` file may only export async functions, which is why `resetGrowSyncLockForTests` is async.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/server-actions/rockSyncGrowRunsheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Fire it from `RunsheetManager`**

Add the import:

```ts
import { rockSyncGrowRunsheets } from '@/server-actions/rockSyncGrowRunsheets';
```

After `const channelsQuery = ...`, add:

```ts
  // Auto-create upcoming Grow Course runsheets once per page load. Never
  // blocks the list; refresh it only when something was actually created.
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    rockSyncGrowRunsheets()
      .then((res) => {
        if (!cancelled && res.created > 0) queryClient.invalidateQueries(runsheetQueryKeys.channelsRoot);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);
```

If `runsheetQueryKeys` is not already imported there, import it from `./runsheetQueries`.

- [ ] **Step 6: Run the suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server-actions/rockSyncGrowRunsheets.ts src/server-actions/rockSyncGrowRunsheets.test.ts src/components/runsheet/RunsheetManager.tsx
git commit -m "feat: auto-create upcoming Grow Course runsheets on load"
```

---

### Task 9: Runsheet kind filter

**Files:**
- Create: `src/lib/runsheetKind.ts`
- Test: `src/lib/runsheetKind.test.ts`
- Modify: `src/lib/userPreferences.ts`, `src/components/runsheet/RunsheetLandingView.tsx`

**Interfaces:**
- Consumes: `extractChannelDate` (`runsheetDate`).
- Produces:
  - `type RunsheetKind = 'sunday' | 'youth' | 'grow' | 'other'`
  - `RUNSHEET_KIND_LABELS: Record<RunsheetKind, string>`
  - `RUNSHEET_KIND_ORDER: RunsheetKind[]`
  - `getRunsheetKind(name: string): RunsheetKind`
  - `getRunsheetKindPreference(): RunsheetKind | 'all'`, `setRunsheetKindPreference(kind: RunsheetKind | 'all'): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { getRunsheetKind } from './runsheetKind';

describe('getRunsheetKind', () => {
  it('classifies by title', () => {
    expect(getRunsheetKind('MNL Grow - Bible Essentials // September 29, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL | Grow | Presence Filled Life // October 27, 2026 // 7PM')).toBe('grow');
    expect(getRunsheetKind('MNL Youth // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL FY Service // September 25, 2026 // 7PM')).toBe('youth');
    expect(getRunsheetKind('MNL Crowne // September 27, 2026 // 3PM')).toBe('sunday');
    expect(getRunsheetKind('MNL Family Night // September 30, 2026 // 7PM')).toBe('other');
  });

  it('does not treat "growth" as Grow', () => {
    expect(getRunsheetKind('MNL Growth Summit // September 30, 2026 // 7PM')).toBe('other');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/runsheetKind.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```ts
/**
 * Coarse runsheet grouping for the list filter. Rock returns no categories
 * for runsheet channels, so the title is the signal.
 */
import { extractChannelDate } from './runsheetDate';

export type RunsheetKind = 'sunday' | 'youth' | 'grow' | 'other';

export const RUNSHEET_KIND_ORDER: RunsheetKind[] = ['sunday', 'youth', 'grow', 'other'];

export const RUNSHEET_KIND_LABELS: Record<RunsheetKind, string> = {
  sunday: 'Sunday',
  youth: 'Youth',
  grow: 'Grow',
  other: 'Other',
};

export function getRunsheetKind(name: string): RunsheetKind {
  if (/\bgrow\b/i.test(name)) return 'grow';
  if (/youth|\bfy\b/i.test(name)) return 'youth';
  if (extractChannelDate(name)?.getDay() === 0) return 'sunday';
  return 'other';
}
```

Append to `src/lib/userPreferences.ts`:

```ts
export const STORAGE_KEY_RUNSHEET_KIND = 'runsheet_pref_kind';

const RUNSHEET_KIND_VALUES = ['all', 'sunday', 'youth', 'grow', 'other'] as const;
export type RunsheetKindPreference = (typeof RUNSHEET_KIND_VALUES)[number];

/** The last runsheet list kind filter; defaults to 'all'. */
export function getRunsheetKindPreference(): RunsheetKindPreference {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY_RUNSHEET_KIND);
    return (RUNSHEET_KIND_VALUES as readonly string[]).includes(stored || '') ? (stored as RunsheetKindPreference) : 'all';
  } catch {
    return 'all';
  }
}

export function setRunsheetKindPreference(kind: RunsheetKindPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY_RUNSHEET_KIND, kind);
  } catch {
    // Gracefully ignore storage exceptions (e.g. private browsing, quota)
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/lib/runsheetKind.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the pills to `RunsheetLandingView`**

Add these imports:

```ts
import { getRunsheetKind, RUNSHEET_KIND_LABELS, RUNSHEET_KIND_ORDER } from '@/lib/runsheetKind';
import {
  getRunsheetKindPreference,
  setRunsheetKindPreference,
  type RunsheetKindPreference,
} from '@/lib/userPreferences';
```

Next to `selectedCampusFilter`:

```ts
  const [selectedKind, setSelectedKind] = useState<RunsheetKindPreference>('all');
  useEffect(() => setSelectedKind(getRunsheetKindPreference()), []);

  const distinctKinds = useMemo(() => {
    const present = new Set(channels.map((c) => getRunsheetKind(c.name)));
    return RUNSHEET_KIND_ORDER.filter((k) => present.has(k));
  }, [channels]);
```

In `filteredChannels`, after the campus check, add the check below and add `selectedKind` to that memo's dependency array:

```ts
      if (selectedKind !== 'all' && getRunsheetKind(c.name) !== selectedKind) {
        return false;
      }
```

Directly after the campus pills block (the `{distinctCampuses.length > 1 && (...)}` element), render this block. It uses the same classes as the campus pills:

```tsx
        {distinctKinds.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {(['all', ...distinctKinds] as RunsheetKindPreference[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setSelectedKind(kind);
                  setRunsheetKindPreference(kind);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  selectedKind === kind
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {kind === 'all' ? 'All' : RUNSHEET_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
        )}
```

Before settling on the active and inactive colours, read the existing campus pill `className`s in this file and copy them exactly, so both pill rows match.

If the stored preference names a kind that has no channels in the current list, show every channel:

```ts
  const effectiveKind = selectedKind !== 'all' && !distinctKinds.includes(selectedKind) ? 'all' : selectedKind;
```

Use `effectiveKind` instead of `selectedKind` in the filter and in the pill highlight.

- [ ] **Step 6: Typecheck and check by hand**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

Run `pnpm dev`: the pills appear, filter the list, and the selection survives a reload.

- [ ] **Step 7: Commit**

```bash
git add src/lib/runsheetKind.ts src/lib/runsheetKind.test.ts src/lib/userPreferences.ts src/components/runsheet/RunsheetLandingView.tsx
git commit -m "feat: filter the runsheet list by Sunday, Youth, Grow and Other"
```

---

### Task 10: Release 1.16.0

**Files:**
- Modify: `package.json` (`"version": "1.15.1"` → `"1.16.0"`)

- [ ] **Step 1: Bump the version**

Change the version line in `package.json` to `"version": "1.16.0",`.

- [ ] **Step 2: Run the full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: release 1.16.0"
```
