# Grow Course Manual Creation, Compare & Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop auto-creating Grow runsheets on page load, let a leader create one Grow session or every upcoming session of a course, and make Review & Propagate and Compare work across the sessions of one Grow course.

**Architecture:**
- The on-load sync effect is removed. The sync server action is replaced by `rockCreateGrowCourseRunsheets(scheduleId)`, which creates the missing sessions of one course.
- `resolveSiblings` gains a Grow branch that matches on the course prefix, the title text before the first `//`, regardless of date.
- A new pure helper, `resolveCompareCandidates`, scopes the Compare view to the source's course.
- The create form shows an opt-in checkbox for batch creation.

**Tech Stack:** Next.js 15 server actions, TypeScript, React 18, react-query v3, Jest + ts-jest, @testing-library/react (jsdom via a per-file `@jest-environment jsdom` docblock).

## Global Constraints

- Creating a runsheet is always an explicit user action. **Nothing** creates runsheets when a component mounts.
- The batch checkbox defaults to **unchecked**. Unchecked creates exactly 1 runsheet for the selected date.
- A batch skips dates that already have a runsheet, using the existing `planMissingGrowRunsheets`. Each batch creates at most `GROW_SYNC_CAP` (50) runsheets.
- Sunday, Youth and Other sibling matching is unchanged: same campus and same date.
- A runsheet counts as Grow when `getRunsheetKind(name) === 'grow'` (`src/lib/runsheetKind.ts`). Its course key is the text before the first `//`, trimmed, with spaces collapsed and case ignored.
- Versioning (AGENTS.md: "Use semver"): this adds a user-facing feature (batch creation) and changes behaviour, so it is a **minor** bump, **1.16.2 → 1.17.0**. The spec says `1.16.3`. That conflicts with semver, so this plan follows AGENTS.md, and the spec's last line is corrected in Task 6.
- Run tests with `pnpm test -- <path>`, the full suite with `pnpm test`, and then `pnpm typecheck` and `pnpm lint`.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Map

| File | Change |
|---|---|
| `src/lib/runsheetSiblings.ts` | Add `extractGrowCoursePrefix`, a Grow branch in `resolveSiblings`, `resolveCompareCandidates` and `compareChipLabel` |
| `tests/unit/lib/runsheetSiblings.test.ts` | Tests for all of the above |
| `src/server-actions/rockCreateGrowCourseRunsheets.ts` (new) | Create the missing sessions of one course |
| `src/server-actions/rockCreateGrowCourseRunsheets.test.ts` (new) | Its tests |
| `src/server-actions/rockSyncGrowRunsheets.ts` + `.test.ts` | **Delete** |
| `src/server-actions/rockGetScheduleOptions.ts` | Grow options gain `upcomingCount` |
| `src/components/runsheet/CreateRunsheetForm.tsx` | Batch checkbox and batch submit |
| `tests/unit/components/CreateRunsheetForm.test.tsx` (new) | Form tests |
| `src/components/runsheet/RunsheetManager.tsx` | Remove the sync effect; scope Compare candidates |
| `tests/unit/components/RunsheetManager.growSync.test.tsx` (new) | Checks that nothing is created on mount |
| `src/components/runsheet/RunsheetCompareView.tsx` | Chip label shows the date for Grow |
| `package.json` | 1.17.0 |

---

### Task 1: Course-scoped sibling and compare helpers

**Files:**
- Modify: `src/lib/runsheetSiblings.ts`
- Test: `tests/unit/lib/runsheetSiblings.test.ts`

**Interfaces:**
- Consumes: `getRunsheetKind` (`src/lib/runsheetKind.ts`), `extractChannelDate` (`src/lib/runsheetDate.ts`), `RunsheetChannelOption`.
- Produces:
  - `extractGrowCoursePrefix(name: string): string | null`. Returns the normalised (lower-case, single-spaced) text before the first `//` for Grow titles, and `null` for any other title or when there is no `//`.
  - `resolveSiblings(...)`. The signature is unchanged. For Grow sources it returns every other channel of the same course, sorted by date and all `preselected: true`.
  - `resolveCompareCandidates(sourceChannelId: number | null, sourceName: string | undefined, allChannels: RunsheetChannelOption[]): RunsheetChannelOption[]`. For a Grow source it returns the source plus its course sessions, sorted by date. Otherwise it returns `allChannels` unchanged.
  - `compareChipLabel(name: string): string`. For Grow titles this is a short date such as `"Oct 6"`. For everything else it is the trailing time segment, the current behaviour.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/runsheetSiblings.test.ts`, and extend its import to `import { compareChipLabel, extractGrowCoursePrefix, resolveCompareCandidates, resolveSiblings } from '@/lib/runsheetSiblings';`:

```ts
describe('Grow course siblings', () => {
  const grow: RunsheetChannelOption[] = [
    channel(10, 'MNL Grow - Bible Essentials // October 13, 2026 // 7PM'),
    channel(11, 'MNL Grow - Bible Essentials // September 29, 2026 // 7PM'),
    channel(12, 'MNL Grow - Bible Essentials // October 6, 2026 // 7PM'),
    channel(13, 'MNL Grow - Bible Masterclass // October 6, 2026 // 7PM'),
    channel(14, 'MNL Crowne // October 4, 2026 // 9AM'),
    channel(15, 'MNL Crowne // October 4, 2026 // 11:30AM'),
  ];

  it('extracts a normalised course prefix only for Grow titles', () => {
    expect(extractGrowCoursePrefix('MNL  Grow - Bible Essentials // October 6, 2026 // 7PM')).toBe(
      'mnl grow - bible essentials',
    );
    expect(extractGrowCoursePrefix('MNL Crowne // October 4, 2026 // 9AM')).toBeNull();
    expect(extractGrowCoursePrefix('MNL Grow - Bible Essentials')).toBeNull();
  });

  it('matches other dates of the same course, sorted by date', () => {
    const result = resolveSiblings(12, grow[2].name, grow);
    expect(result.map((s) => s.channelId)).toEqual([11, 10]);
    expect(result.every((s) => s.preselected)).toBe(true);
  });

  it('does not match a different course on the same date', () => {
    expect(resolveSiblings(12, grow[2].name, grow).some((s) => s.channelId === 13)).toBe(false);
  });

  it('keeps same-date matching for Sunday runsheets', () => {
    expect(resolveSiblings(14, grow[4].name, grow).map((s) => s.channelId)).toEqual([15]);
  });
});

describe('resolveCompareCandidates', () => {
  const all: RunsheetChannelOption[] = [
    channel(20, 'MNL Grow - Bible Essentials // October 6, 2026 // 7PM'),
    channel(21, 'MNL Grow - Bible Essentials // September 29, 2026 // 7PM'),
    channel(22, 'MNL Crowne // October 4, 2026 // 9AM'),
  ];

  it('scopes a Grow source to its course, source included, sorted by date', () => {
    expect(resolveCompareCandidates(20, all[0].name, all).map((c) => c.id)).toEqual([21, 20]);
  });

  it('returns every channel for a non-Grow or missing source', () => {
    expect(resolveCompareCandidates(22, all[2].name, all)).toBe(all);
    expect(resolveCompareCandidates(null, undefined, all)).toBe(all);
  });
});

describe('compareChipLabel', () => {
  it('uses the date for Grow and the time otherwise', () => {
    expect(compareChipLabel('MNL Grow - Bible Essentials // October 6, 2026 // 7PM')).toBe('Oct 6');
    expect(compareChipLabel('MNL Crowne // October 4, 2026 // 11:30AM')).toBe('11:30AM');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- tests/unit/lib/runsheetSiblings.test.ts`
Expected: the new cases FAIL because `extractGrowCoursePrefix` and the other helpers are not exported. The existing cases still PASS.

- [ ] **Step 3: Implement**

Replace `src/lib/runsheetSiblings.ts` with:

```ts
/**
 * Finds sibling runsheets for propagation and compare.
 *
 * Services (Sunday/Youth/Other) are siblings when they share a campus and a
 * date — the 10AM, 3PM and 5PM of one Sunday. Grow Course sessions run on
 * successive dates, so a Grow runsheet's siblings are the other sessions of
 * the same course: every channel sharing its title prefix before `//`.
 * `preselected` is always true today but exists so a future option is a
 * change to the filter, not to how the result is consumed.
 */
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { extractChannelDate } from '@/lib/runsheetDate';
import { getRunsheetKind } from '@/lib/runsheetKind';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

export interface SiblingChannel {
  channelId: number;
  name: string;
  time: string;
  preselected: boolean;
}

/** Normalised course key for a Grow title, or null for anything else. */
export function extractGrowCoursePrefix(name: string): string | null {
  if (!name || getRunsheetKind(name) !== 'grow' || !name.includes('//')) return null;
  const prefix = name.split('//')[0].trim().replace(/\s+/g, ' ').toLowerCase();
  return prefix || null;
}

function byDate(a: RunsheetChannelOption, b: RunsheetChannelOption): number {
  return (extractChannelDate(a.name)?.getTime() ?? 0) - (extractChannelDate(b.name)?.getTime() ?? 0);
}

function sameCourse(prefix: string, allChannels: RunsheetChannelOption[]): RunsheetChannelOption[] {
  return allChannels.filter((c) => extractGrowCoursePrefix(c.name) === prefix).sort(byDate);
}

export function resolveSiblings(
  sourceChannelId: number,
  sourceName: string,
  allChannels: RunsheetChannelOption[],
): SiblingChannel[] {
  const toSibling = (c: RunsheetChannelOption): SiblingChannel => ({
    channelId: c.id,
    name: c.name,
    time: c.time,
    preselected: true,
  });

  const coursePrefix = extractGrowCoursePrefix(sourceName);
  if (coursePrefix) {
    return sameCourse(coursePrefix, allChannels)
      .filter((c) => c.id !== sourceChannelId)
      .map(toSibling);
  }

  const sourceCampus = extractRunsheetCampus(sourceName);
  const sourceDate = extractChannelDate(sourceName);
  if (!sourceCampus || !sourceDate) return [];

  return allChannels
    .filter((c) => c.id !== sourceChannelId)
    .filter((c) => extractRunsheetCampus(c.name) === sourceCampus)
    .filter((c) => {
      const d = extractChannelDate(c.name);
      return !!d && d.getTime() === sourceDate.getTime();
    })
    .map(toSibling);
}

/** Channels offered in Compare: a Grow source's course sessions, else everything. */
export function resolveCompareCandidates(
  sourceChannelId: number | null,
  sourceName: string | undefined,
  allChannels: RunsheetChannelOption[],
): RunsheetChannelOption[] {
  const coursePrefix = sourceChannelId !== null && sourceName ? extractGrowCoursePrefix(sourceName) : null;
  if (!coursePrefix) return allChannels;
  return sameCourse(coursePrefix, allChannels);
}

/** Compare chip text: Grow sessions share a time, so show their date instead. */
export function compareChipLabel(name: string): string {
  if (extractGrowCoursePrefix(name)) {
    const date = extractChannelDate(name);
    if (date) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return name.split('//').pop()?.trim() || name;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test -- tests/unit/lib/runsheetSiblings.test.ts`
Expected: all PASS, old and new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetSiblings.ts tests/unit/lib/runsheetSiblings.test.ts
git commit -m "feat: treat sessions of one Grow course as siblings"
```

---

### Task 2: Remove auto-sync and add the course batch-create action

**Files:**
- Create: `src/server-actions/rockCreateGrowCourseRunsheets.ts`
- Test: `src/server-actions/rockCreateGrowCourseRunsheets.test.ts`
- Delete: `src/server-actions/rockSyncGrowRunsheets.ts`, `src/server-actions/rockSyncGrowRunsheets.test.ts`
- Modify: `src/components/runsheet/RunsheetManager.tsx` (remove the import at line 14 and the effect at lines 98-112)
- Test: `tests/unit/components/RunsheetManager.growSync.test.tsx`

**Interfaces:**
- Consumes: `fetchGrowSchedules` (`src/server-actions/internal/rockGrowSchedules.ts`), `planMissingGrowRunsheets`, `GROW_CONTENT_CHANNEL_CATEGORY_ID`, `GROW_SYNC_CAP` (`src/lib/growRunsheets.ts`), `canUserEditRunsheet` (`src/lib/permissions.ts`), `rockCreateServiceRunsheet(title, 13, categoryId)`.
- Produces: `rockCreateGrowCourseRunsheets(scheduleId: number): Promise<{ success: boolean; created: Array<{ id: number; title: string }>; skipped: number; error?: string }>`. `created` is in date order. `skipped` counts planned titles whose creation failed.

- [ ] **Step 1: Write the failing action test**

Create `src/server-actions/rockCreateGrowCourseRunsheets.test.ts`:

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';
import { rockCreateGrowCourseRunsheets } from './rockCreateGrowCourseRunsheets';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('./rockCreateServiceRunsheet', () => ({ rockCreateServiceRunsheet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockGet = jest.mocked(rockGet);
const mockCreate = jest.mocked(rockCreateServiceRunsheet);

const essentials = 'BEGIN:VEVENT\r\nDTSTART:20991006T190000\r\nRDATE:20991013T190000,20991020T190000\r\nEND:VEVENT';
const masterclass = 'BEGIN:VEVENT\r\nDTSTART:20991007T190000\r\nEND:VEVENT';

beforeEach(() => {
  jest.resetAllMocks();
  let nextId = 500;
  mockCreate.mockImplementation((async () => ({ success: true, id: nextId++ })) as any);
  mockGet.mockImplementation((async (url: string) => {
    if (url === '/Schedules') {
      return [
        { Id: 477, Name: 'MNL Grow - Bible Essentials', iCalendarContent: essentials },
        { Id: 476, Name: 'MNL Grow - Bible Masterclass', iCalendarContent: masterclass },
      ];
    }
    if (url === '/ContentChannels') return [{ Name: 'MNL Grow - Bible Essentials // October 13, 2099 // 7PM' }];
    return [];
  }) as any);
});

describe('rockCreateGrowCourseRunsheets', () => {
  it('refuses a user who cannot edit', async () => {
    mockSession.mockResolvedValue({ rolesMap: { viewer: ['1'] } } as any);
    const res = await rockCreateGrowCourseRunsheets(477);
    expect(res.success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates only the missing sessions of the chosen course, in date order', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    const res = await rockCreateGrowCourseRunsheets(477);
    expect(res).toEqual({
      success: true,
      skipped: 0,
      created: [
        { id: 500, title: 'MNL Grow - Bible Essentials // October 6, 2099 // 7PM' },
        { id: 501, title: 'MNL Grow - Bible Essentials // October 20, 2099 // 7PM' },
      ],
    });
    expect(mockCreate).toHaveBeenCalledWith('MNL Grow - Bible Essentials // October 6, 2099 // 7PM', 13, 338);
    expect(mockCreate).not.toHaveBeenCalledWith(expect.stringContaining('Masterclass'), 13, 338);
  });

  it('reports an unknown course', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    const res = await rockCreateGrowCourseRunsheets(999);
    expect(res.success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('counts failed creations as skipped and keeps going', async () => {
    mockSession.mockResolvedValue({ rolesMap: { growEditor: ['19108'] } } as any);
    mockCreate
      .mockResolvedValueOnce({ success: false, error: 'boom' } as any)
      .mockResolvedValueOnce({ success: true, id: 777 } as any);
    const res = await rockCreateGrowCourseRunsheets(477);
    expect(res.created).toEqual([{ id: 777, title: 'MNL Grow - Bible Essentials // October 20, 2099 // 7PM' }]);
    expect(res.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/server-actions/rockCreateGrowCourseRunsheets.test.ts`
Expected: FAIL with "Cannot find module './rockCreateGrowCourseRunsheets'".

- [ ] **Step 3: Implement the action**

Create `src/server-actions/rockCreateGrowCourseRunsheets.ts`:

```ts
'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserEditRunsheet } from '@/lib/permissions';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID, GROW_SYNC_CAP, planMissingGrowRunsheets } from '@/lib/growRunsheets';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

/**
 * Creates a runsheet for every upcoming session of one Grow course that has
 * none yet. Only ever called from an explicit "create all sessions" submit.
 * Each creation goes through rockCreateServiceRunsheet, so the caller's
 * edit access is re-checked per title.
 */
export async function rockCreateGrowCourseRunsheets(scheduleId: number): Promise<{
  success: boolean;
  created: Array<{ id: number; title: string }>;
  skipped: number;
  error?: string;
}> {
  try {
    const session = await getRockSession();
    if (!canUserEditRunsheet(session)) {
      return { success: false, created: [], skipped: 0, error: 'Unauthorized: Only runsheet editors can perform this action.' };
    }

    const [schedules, channels] = await Promise.all([
      fetchGrowSchedules(),
      rockGet('/ContentChannels', {
        $filter: `ContentChannelTypeId eq ${RUNSHEET_CONTENT_CHANNEL_TYPE_ID}`,
        $select: 'Name',
        $top: 5000,
      }, true) as Promise<Array<{ Name: string }> | null>,
    ]);

    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return { success: false, created: [], skipped: 0, error: 'Grow course not found.' };

    // Existing titles from every course are passed so title matching stays
    // unambiguous; only the chosen course is planned.
    const titles = planMissingGrowRunsheets([schedule], (channels || []).map((c) => c.Name), manilaToday(), GROW_SYNC_CAP);

    const created: Array<{ id: number; title: string }> = [];
    let skipped = 0;
    for (const title of titles) {
      try {
        const res = await rockCreateServiceRunsheet(title, RUNSHEET_CONTENT_CHANNEL_TYPE_ID, GROW_CONTENT_CHANNEL_CATEGORY_ID);
        if (res.success && res.id) created.push({ id: res.id, title });
        else {
          skipped++;
          console.warn(`[grow-course] could not create "${title}": ${res.error}`);
        }
      } catch (error) {
        skipped++;
        console.warn(`[grow-course] could not create "${title}"`, error);
      }
    }
    return { success: true, created, skipped };
  } catch (error) {
    console.error('[grow-course] batch create failed', error);
    return { success: false, created: [], skipped: 0, error: 'Failed to create Grow course runsheets.' };
  }
}
```

If `GROW_SYNC_CAP` is not exported from `src/lib/growRunsheets.ts`, export it there (`export const GROW_SYNC_CAP = 50;`).

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test -- src/server-actions/rockCreateGrowCourseRunsheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing "no auto-create on mount" test**

Create `tests/unit/components/RunsheetManager.growSync.test.tsx`. The mocks are copied from `RunsheetManager.loading.test.tsx`, with `canUserEditRunsheet` returning **true**:

```tsx
/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockCreateGrowCourseRunsheets } from '@/server-actions/rockCreateGrowCourseRunsheets';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({ assertAuthenticated: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/lib/permissions', () => ({
  canUserEditRunsheet: jest.fn().mockReturnValue(true),
  hasFullEditorRole: jest.fn().mockReturnValue(false),
}));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetails');
jest.mock('@/server-actions/rockCreateGrowCourseRunsheets', () => ({ rockCreateGrowCourseRunsheets: jest.fn() }));
jest.mock('@/server-actions/rockCreateServiceRunsheet', () => ({ rockCreateServiceRunsheet: jest.fn() }));
jest.mock('@/components/runsheet/CreateRunsheetForm', () => ({ CreateRunsheetForm: () => null }));
jest.mock('@/components/runsheet/RunsheetCompareView', () => ({ RunsheetCompareView: () => null }));
jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({ RunsheetTableEditor: () => null }));

describe('RunsheetManager Grow creation', () => {
  it('creates no runsheets on mount, even for an editor', async () => {
    jest.mocked(rockGetAvailableRunsheetChannels).mockResolvedValue({ success: true, channels: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RunsheetManager user={{ rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [] } } as any} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(rockGetAvailableRunsheetChannels).toHaveBeenCalled());
    expect(rockCreateGrowCourseRunsheets).not.toHaveBeenCalled();
    expect(rockCreateServiceRunsheet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test and see it fail to compile**

Run: `pnpm test -- tests/unit/components/RunsheetManager.growSync.test.tsx`
Expected: FAIL. The unmocked `rockSyncGrowRunsheets` import in `RunsheetManager` runs against a mocked `rockFetch`, or the suite errors. Either way, the effect must go.

- [ ] **Step 7: Remove the sync from `RunsheetManager` and delete the old action**

In `src/components/runsheet/RunsheetManager.tsx`:
- Delete `import { rockSyncGrowRunsheets } from '@/server-actions/rockSyncGrowRunsheets';`.
- Delete the whole block that starts with `// Auto-create upcoming Grow Course runsheets once per page load.` and ends with `}, [canEdit]);`.
- If `runsheetQueryKeys` or `queryClient` are now unused, `pnpm lint` will say so. Leave them if they are used elsewhere in the file.

Then:

```bash
git rm src/server-actions/rockSyncGrowRunsheets.ts src/server-actions/rockSyncGrowRunsheets.test.ts
```

Also delete any other reference to it:

```bash
grep -rn "rockSyncGrowRunsheets\|resetGrowSyncLockForTests" src tests
```

Expected: no output.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `pnpm test -- tests/unit/components src/server-actions && pnpm typecheck`
Expected: PASS, with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A src/server-actions/rockCreateGrowCourseRunsheets.ts src/server-actions/rockCreateGrowCourseRunsheets.test.ts src/components/runsheet/RunsheetManager.tsx tests/unit/components/RunsheetManager.growSync.test.tsx src/lib/growRunsheets.ts
git commit -m "feat: stop auto-creating Grow runsheets on load; add course batch create"
```

---

### Task 3: Schedule options report the upcoming session count

**Files:**
- Modify: `src/server-actions/rockGetScheduleOptions.ts` (the `ScheduleOption` interface and the Grow branch around line 52)

**Interfaces:**
- Consumes: `expandIcalOccurrences` (`src/lib/scheduleOccurrences.ts`), `GrowSchedule` fields from `fetchGrowSchedules`.
- Produces: `ScheduleOption.upcomingCount?: number`, the number of Grow sessions from today onward. It is set only for Grow options.

- [ ] **Step 1: Add the field and populate it**

In the `ScheduleOption` interface, under `nextDate?: string;`, add:

```ts
  /** Grow only: sessions from today onward, for the "create all" option. */
  upcomingCount?: number;
```

In the Grow branch, replace the `schedules.push({...})` line with:

```ts
        const upcomingCount = expandIcalOccurrences(s.iCalendarContent, today, s.effectiveEndDate).length;
        schedules.push({
          id: s.id,
          name: s.name,
          categoryId: 483,
          timeLabel: next.time,
          nextDate: next.date,
          upcomingCount,
        });
```

Make sure `expandIcalOccurrences` is imported from `@/lib/scheduleOccurrences`. The earlier Grow work already imports it in this file; add the import if it is missing.

- [ ] **Step 2: Typecheck and test**

Run: `pnpm typecheck && pnpm test -- src/server-actions`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server-actions/rockGetScheduleOptions.ts
git commit -m "feat: report upcoming session count for Grow schedule options"
```

---

### Task 4: Create form, with 1 session or all sessions

**Files:**
- Modify: `src/components/runsheet/CreateRunsheetForm.tsx`
- Test: `tests/unit/components/CreateRunsheetForm.test.tsx`

**Interfaces:**
- Consumes: `ScheduleOption.id`, `.upcomingCount` (Task 3); `rockCreateGrowCourseRunsheets(scheduleId)` (Task 2); `GROW_CONTENT_CHANNEL_CATEGORY_ID`.
- Produces: the checkbox, with label text `Create runsheets for all upcoming dates of this course (<Course Name>, <N> sessions)` and the accessible name matched by `/all upcoming dates of this course/i`.

- [ ] **Step 1: Write the failing form tests**

Create `tests/unit/components/CreateRunsheetForm.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateRunsheetForm } from '@/components/runsheet/CreateRunsheetForm';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';
import { rockCreateGrowCourseRunsheets } from '@/server-actions/rockCreateGrowCourseRunsheets';

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/server-actions/getRockContentChannelOptions', () => ({ getRockContentChannelOptions: jest.fn() }));
jest.mock('@/server-actions/rockGetScheduleOptions', () => ({ rockGetScheduleOptions: jest.fn() }));
jest.mock('@/server-actions/rockCreateServiceRunsheet', () => ({ rockCreateServiceRunsheet: jest.fn() }));
jest.mock('@/server-actions/rockCreateGrowCourseRunsheets', () => ({ rockCreateGrowCourseRunsheets: jest.fn() }));

const growSchedule = {
  id: 477,
  name: 'MNL Grow - Bible Essentials',
  categoryId: 483,
  timeLabel: '7PM',
  nextDate: '2099-10-06',
  upcomingCount: 3,
};

function setup(schedules = [growSchedule]) {
  jest.mocked(getRockContentChannelOptions).mockResolvedValue({
    success: true,
    types: [{ id: 13, name: 'Service Runsheet' }],
    categories: [{ id: 338, name: 'MNL | Grow Class' }],
  } as any);
  jest.mocked(rockGetScheduleOptions).mockResolvedValue({ success: true, schedules } as any);
  const onCreated = jest.fn();
  render(<CreateRunsheetForm runsheetCampuses={['ALL']} onCreated={onCreated} />);
  return { onCreated };
}

beforeEach(() => jest.clearAllMocks());

describe('CreateRunsheetForm Grow creation', () => {
  it('offers an unchecked "all sessions" option for a multi-session course', async () => {
    setup();
    const box = await screen.findByRole('checkbox', { name: /all upcoming dates of this course/i });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/MNL Grow - Bible Essentials, 3 sessions/)).toBeInTheDocument();
  });

  it('hides the option for a single-session course', async () => {
    setup([{ ...growSchedule, upcomingCount: 1 }]);
    await waitFor(() => expect(rockGetScheduleOptions).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox', { name: /all upcoming dates of this course/i })).toBeNull();
  });

  it('creates exactly one runsheet when unchecked', async () => {
    jest.mocked(rockCreateServiceRunsheet).mockResolvedValue({ success: true, id: 42 } as any);
    const { onCreated } = setup();
    await screen.findByRole('checkbox', { name: /all upcoming dates of this course/i });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(1));
    expect(rockCreateGrowCourseRunsheets).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(42, expect.stringContaining('MNL Grow - Bible Essentials //'), undefined);
  });

  it('batch-creates the course when checked and opens the first new runsheet', async () => {
    jest.mocked(rockCreateGrowCourseRunsheets).mockResolvedValue({
      success: true,
      skipped: 0,
      created: [
        { id: 7, title: 'MNL Grow - Bible Essentials // October 6, 2099 // 7PM' },
        { id: 8, title: 'MNL Grow - Bible Essentials // October 13, 2099 // 7PM' },
      ],
    });
    const { onCreated } = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: /all upcoming dates of this course/i }));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(rockCreateGrowCourseRunsheets).toHaveBeenCalledWith(477));
    expect(rockCreateServiceRunsheet).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(7, 'MNL Grow - Bible Essentials // October 6, 2099 // 7PM');
  });

  it('reports when every session already exists', async () => {
    jest.mocked(rockCreateGrowCourseRunsheets).mockResolvedValue({ success: true, skipped: 0, created: [] });
    const { onCreated } = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: /all upcoming dates of this course/i }));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(/already have runsheets/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
```

If the submit button's visible text does not match `/create/i` uniquely (for example, a heading also says "Create"), use `getByRole('button', { name: /^create/i })` after checking the button's label in the file.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test -- tests/unit/components/CreateRunsheetForm.test.tsx`
Expected: FAIL. The checkbox is not found.

- [ ] **Step 3: Add state, the checkbox and batch submit**

In `CreateRunsheetForm.tsx`, add this import:

```ts
import { rockCreateGrowCourseRunsheets } from '@/server-actions/rockCreateGrowCourseRunsheets';
```

Next to the other `useState` calls, add:

```ts
  const [batchCreateCourse, setBatchCreateCourse] = useState(false);
```

After the Grow next-date effect, reset the checkbox whenever the course changes, so it always starts unchecked:

```ts
  useEffect(() => {
    setBatchCreateCourse(false);
  }, [session, selectedCategoryId]);

  const selectedGrowSchedule =
    selectedCategoryId === GROW_CONTENT_CHANNEL_CATEGORY_ID ? schedules.find((s) => s.name === session) : undefined;
  const canBatchCreate = (selectedGrowSchedule?.upcomingCount ?? 0) > 1;
```

In `handleSubmit`, directly after `setStatus({ type: 'loading' });`, add the batch path:

```ts
    if (batchCreateCourse && canBatchCreate && selectedGrowSchedule) {
      const batch = await rockCreateGrowCourseRunsheets(selectedGrowSchedule.id);
      if (!batch.success) {
        const errorMsg = batch.error || 'Unknown error';
        setStatus({ type: 'error', message: errorMsg });
        toast.error(errorMsg);
        return;
      }
      if (batch.created.length === 0) {
        const msg = `All upcoming sessions of ${selectedGrowSchedule.name} already have runsheets.`;
        setStatus({ type: 'success', message: msg });
        toast.success(msg);
        return;
      }
      const msg =
        `Created ${batch.created.length} runsheet${batch.created.length === 1 ? '' : 's'} for ${selectedGrowSchedule.name}` +
        (batch.skipped ? ` (${batch.skipped} could not be created)` : '') +
        '.';
      setStatus({ type: 'success', message: msg });
      toast.success(msg);
      onCreated?.(batch.created[0].id, batch.created[0].title);
      return;
    }
```

The existing single-create path below it stays unchanged.

While `status.type === 'loading'`, the existing submit button already shows the busy state. If it doesn't, add `disabled={status.type === 'loading'}` to the submit button. That covers the "progress indicator" requirement.

Render the checkbox directly after the Session / Service Schedule `<select>` block, before the title input:

```tsx
          {canBatchCreate && selectedGrowSchedule && (
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={batchCreateCourse}
                onChange={(e) => setBatchCreateCourse(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>
                Create runsheets for all upcoming dates of this course ({selectedGrowSchedule.name},{' '}
                {selectedGrowSchedule.upcomingCount} sessions)
              </span>
            </label>
          )}
```

The text inside the `<span>` must render as one string for the `/MNL Grow - Bible Essentials, 3 sessions/` assertion to pass. The JSX above renders `(MNL Grow - Bible Essentials, 3 sessions)`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test -- tests/unit/components/CreateRunsheetForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/CreateRunsheetForm.tsx tests/unit/components/CreateRunsheetForm.test.tsx
git commit -m "feat: optionally create every upcoming session of a Grow course"
```

---

### Task 5: Course-scoped Compare view

**Files:**
- Modify: `src/components/runsheet/RunsheetManager.tsx` (the compare button `onClick` at about lines 491-505, and the `<RunsheetCompareView` props at about line 649)
- Modify: `src/components/runsheet/RunsheetCompareView.tsx` (the chip label at about line 545)
- Test: `tests/unit/components/RunsheetCompareView.test.tsx` (extend)

**Interfaces:**
- Consumes: `resolveCompareCandidates`, `compareChipLabel` (Task 1).
- Produces: behaviour only. Review & Propagate needs no UI change: `RunsheetTableEditor` and `RunsheetTableEditorDiff` already call `resolveSiblings`, which now returns course sessions for Grow.

- [ ] **Step 1: Write the failing chip-label test**

Add to `tests/unit/components/RunsheetCompareView.test.tsx`, inside the existing `describe`, reusing its `detail` helper and mocks:

```tsx
  it('labels Grow course chips by date', async () => {
    const grow = [
      { id: 1, name: 'MNL Grow - Bible Essentials // September 29, 2026 // 7PM', time: '7PM' },
      { id: 2, name: 'MNL Grow - Bible Essentials // October 6, 2026 // 7PM', time: '7PM' },
    ];
    render(<RunsheetCompareView channelIds={[1, 2]} availableChannels={grow} onClose={jest.fn()} />);
    expect(await screen.findByRole('button', { name: /Sep 29/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Oct 6/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- tests/unit/components/RunsheetCompareView.test.tsx`
Expected: the new case FAILS, because both chips read "7PM".

- [ ] **Step 3: Use `compareChipLabel` in the Compare view**

In `RunsheetCompareView.tsx`, add this import:

```ts
import { compareChipLabel } from '@/lib/runsheetSiblings';
```

Then replace:

```tsx
                  <span>{c.name.split('//').pop()?.trim() || c.name}</span>
```

with:

```tsx
                  <span>{compareChipLabel(c.name)}</span>
```

- [ ] **Step 4: Scope the candidates in `RunsheetManager`**

Add this import:

```ts
import { resolveCompareCandidates } from '@/lib/runsheetSiblings';
```

After `availableChannels` is computed, add:

```ts
  // Opening Compare from a Grow runsheet offers that course's sessions only.
  const selectedChannelName = availableChannels.find((c) => c.id === selectedChannelId)?.name;
  const compareChannels = resolveCompareCandidates(selectedChannelId, selectedChannelName, availableChannels);
```

In the compare button's `onClick`, replace every `availableChannels` reference with `compareChannels`, which covers the `.find`, both `.slice(0, 2)` calls and the `.length` check. Keep the button's visibility condition (`availableChannels.length > 1`) as it is. Change `availableChannels={availableChannels}` on `<RunsheetCompareView` to `availableChannels={compareChannels}`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm test -- tests/unit/components && pnpm typecheck`
Expected: PASS. `RunsheetManager.compare.test.tsx` uses Sunday titles, so it keeps its current behaviour.

- [ ] **Step 6: Check by hand**

Run `pnpm dev`, open a Grow runsheet that has at least two sessions, and then:
- Click **Compare**. Only that course's sessions are offered, labelled by date.
- Enter edit mode, change a cell and open **Review & Propagate**. The other sessions of the course are listed as targets.
- Do **not** confirm a propagation against production data.

- [ ] **Step 7: Commit**

```bash
git add src/components/runsheet/RunsheetManager.tsx src/components/runsheet/RunsheetCompareView.tsx tests/unit/components/RunsheetCompareView.test.tsx
git commit -m "feat: scope Compare to the sessions of a Grow course"
```

---

### Task 6: Release 1.17.0

**Files:**
- Modify: `package.json` (`"version": "1.16.2"` → `"1.17.0"`)
- Modify: `docs/superpowers/specs/2026-09-26-grow-course-manual-creation-compare-review-design.md`, last line

- [ ] **Step 1: Bump the version and correct the spec**

In `package.json`, set `"version": "1.17.0",`.

In the spec, replace `4. **Semver**: Bump version according to semver (\`1.16.3\`).` with `4. **Semver**: Bump the minor version (\`1.17.0\`), because batch creation is a new feature.`

- [ ] **Step 2: Run the full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json docs/superpowers/specs/2026-09-26-grow-course-manual-creation-compare-review-design.md
git commit -m "chore: release 1.17.0"
```
