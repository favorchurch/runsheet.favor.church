# Runsheet Master Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the uncommitted Master Template work as one isolated template per campus that new runsheets copy from, with a guaranteed fallback so a new runsheet is never empty.

**Architecture:** Each campus template is an ordinary runsheet content channel (type 13) named `<CODE> // Runsheet Master Template`. The campus marker in the name lets the existing `assertRunsheetEditAccess` / `canAccessRunsheetChannel` gates enforce isolation unchanged. Pure naming/seeding helpers live in `src/lib/runsheetTemplate.ts`, and server actions and UI import them.

**Tech Stack:** Next.js server actions, TypeScript, React, react-query, react-hot-toast, Jest + Testing Library, Rock RMS REST.

**Spec:** `docs/superpowers/specs/2026-09-23-runsheet-master-template-design.md`

## Global Constraints

- Template channel name format: `` `${campus} // Runsheet Master Template` `` with campus in `'MNL' | 'BNE' | 'SEL'`.
- Campus isolation: a campus editor reaches only their own campus's template; `runsheetCampuses: ['ALL']` reaches all.
- `SIBLINGKEY` (`SIBLINGKEY_ATTRIBUTE_KEY` from `@/constants/runsheetColumns`) is set to `''` on rows copied into a new runsheet.
- Runsheet creation never produces zero rows because of the template: fall back to `buildDefaultTemplateItems()`.
- Server-action errors are user-safe strings (no Rock ids or upstream bodies).
- UI errors use `toast.error` from `react-hot-toast`, never `alert()`.
- Versioning (AGENTS.md: semver): this feature ships as **1.15.0**, after the Favor News fix ships as **1.14.1**.
- Verification commands: `pnpm typecheck` and `pnpm test` must both pass at the end of every task.

---

## Task 0: Separate the Favor News fix from the template work

The working tree currently mixes the finished Favor News propagation fix (already at 1.14.1) with the unfinished template work. Commit the fix on its own first.

**Files (Favor News fix, commit now):**
- `src/components/runsheet/PropagateReviewPanel.tsx`
- `src/components/runsheet/RunsheetTableEditor.tsx`
- `src/lib/runsheetPropagate.ts`
- `src/lib/runsheetPropagateExecute.ts`
- `tests/unit/lib/runsheetPropagate.test.ts`
- `tests/unit/lib/runsheetPropagateExecute.test.ts`
- `package.json` (1.14.1)

**Files (template work, leave uncommitted for later tasks):**
- `src/components/runsheet/RunsheetLandingView.tsx`
- `src/components/runsheet/RunsheetManager.tsx`
- `src/server-actions/rockCreateServiceRunsheet.ts`
- `src/server-actions/rockEnsureRunsheetTemplate.ts`

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b fix/favor-news-propagation
```

- [ ] **Step 2: Stage only the Favor News files**

```bash
git add src/components/runsheet/PropagateReviewPanel.tsx src/components/runsheet/RunsheetTableEditor.tsx \
  src/lib/runsheetPropagate.ts src/lib/runsheetPropagateExecute.ts \
  tests/unit/lib/runsheetPropagate.test.ts tests/unit/lib/runsheetPropagateExecute.test.ts package.json
git diff --cached --stat
```

Expected: exactly those 7 files. `RunsheetTableEditor.tsx` contains only propagation changes (confirm with `git diff --cached src/components/runsheet/RunsheetTableEditor.tsx`: no template code).

- [ ] **Step 3: Verify against the staged tree**

```bash
git stash push --keep-index --include-untracked -m template-wip
pnpm typecheck && pnpm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 4: Commit and restore the template work**

```bash
git commit -m "fix: include newly added rows in propagation review

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git stash pop
git checkout -b feat/runsheet-master-template
```

---

## Task 1: Pure template helpers

**Files:**
- Create: `src/lib/runsheetTemplate.ts`
- Test: `tests/unit/lib/runsheetTemplate.test.ts`

**Interfaces:**
- Consumes: `RunsheetCampusCode` from `@/lib/runsheetCampus`; `DEFAULT_RUNSHEET_TEMPLATE` from `@/constants/defaultRunsheetTemplate`; `RunsheetItemRow` from `@/types/Runsheet`.
- Produces:
  - `MASTER_TEMPLATE_SUFFIX: string` (= `'Runsheet Master Template'`)
  - `masterTemplateName(campus: RunsheetCampusCode): string`
  - `isMasterTemplateName(name: string): boolean`
  - `buildDefaultTemplateItems(): RunsheetItemRow[]`

- [ ] **Step 1: Write the failing test**

```ts
import {
  buildDefaultTemplateItems,
  isMasterTemplateName,
  masterTemplateName,
} from '@/lib/runsheetTemplate';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';

describe('runsheetTemplate', () => {
  it('names a template after its campus', () => {
    expect(masterTemplateName('MNL')).toBe('MNL // Runsheet Master Template');
    expect(masterTemplateName('BNE')).toBe('BNE // Runsheet Master Template');
  });

  it('recognises template names, ignoring case and surrounding whitespace', () => {
    expect(isMasterTemplateName('MNL // Runsheet Master Template')).toBe(true);
    expect(isMasterTemplateName('  sel // runsheet master template  ')).toBe(true);
    expect(isMasterTemplateName('Runsheet Master Template')).toBe(true);
  });

  it('does not treat ordinary runsheets as templates', () => {
    expect(isMasterTemplateName('MNL Crowne // August 9, 2026 // 10AM')).toBe(false);
    expect(isMasterTemplateName('MNL // Runsheet Master Template copy')).toBe(false);
    expect(isMasterTemplateName('')).toBe(false);
  });

  it('builds new, ordered items from the hardcoded default template', () => {
    const items = buildDefaultTemplateItems();
    expect(items).toHaveLength(DEFAULT_RUNSHEET_TEMPLATE.length);
    items.forEach((item, idx) => {
      expect(item.isNew).toBe(true);
      expect(typeof item.id).toBe('string');
      expect(item.order).toBe(idx + 1);
      expect(item.title).toBe(DEFAULT_RUNSHEET_TEMPLATE[idx].title);
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
```

Note: the bare `'Runsheet Master Template'` returns true on purpose, so any leftover global template channel from the old WIP is also hidden (Task 4).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm jest tests/unit/lib/runsheetTemplate.test.ts`
Expected: FAIL, `Cannot find module '@/lib/runsheetTemplate'`.

- [ ] **Step 3: Implement**

Move the seeding code out of `rockEnsureRunsheetTemplate.ts` into this module:

```ts
/**
 * Per-campus runsheet master templates. A template is an ordinary runsheet
 * channel whose name carries its campus marker, so the existing campus gates
 * (`canAccessRunsheetChannel`, `assertRunsheetEditAccess`) isolate it with no
 * special cases.
 */
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import type { RunsheetCampusCode } from '@/lib/runsheetCampus';
import type { RunsheetItemRow } from '@/types/Runsheet';

export const MASTER_TEMPLATE_SUFFIX = 'Runsheet Master Template';

export function masterTemplateName(campus: RunsheetCampusCode): string {
  return `${campus} // ${MASTER_TEMPLATE_SUFFIX}`;
}

export function isMasterTemplateName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(MASTER_TEMPLATE_SUFFIX.toLowerCase());
}

/** The hardcoded Sunday template as unsaved rows — the seed and the fallback. */
export function buildDefaultTemplateItems(): RunsheetItemRow[] {
  const stamp = Date.now();
  return DEFAULT_RUNSHEET_TEMPLATE.map((row, idx) => ({
    id: `new_${idx}_${stamp}`,
    isNew: true,
    title: row.title,
    duration: row.duration,
    attributeValues: {
      ACTIVITYTITLE: row.activityTitle || row.title,
      DESCRIPTION: row.detail,
      DETIAL: row.detail,
    },
    detail: row.detail,
    order: idx + 1,
    anchorPreacher: '',
    mainInstrument: '',
    ledLiveScreens: '',
    overlayBroadcast: '',
    lighting: '',
    audio: '',
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest tests/unit/lib/runsheetTemplate.test.ts && pnpm typecheck`
Expected: 4 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetTemplate.ts tests/unit/lib/runsheetTemplate.test.ts
git commit -m "feat: add per-campus runsheet template helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Per-campus `rockEnsureRunsheetTemplate`

**Files:**
- Modify: `src/server-actions/rockEnsureRunsheetTemplate.ts` (rewrite)
- Test: `tests/unit/server-actions/rockEnsureRunsheetTemplate.test.ts`

**Interfaces:**
- Consumes: `masterTemplateName`, `buildDefaultTemplateItems` (Task 1); `RUNSHEET_CAMPUS_CODES`, `RunsheetCampusCode` from `@/lib/runsheetCampus`; `assertRunsheetEditAccess` from `@/server-actions/runsheetAuthorization`.
- Produces: `rockEnsureRunsheetTemplate(campus: RunsheetCampusCode): Promise<{ success: boolean; id?: number; error?: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockEnsureRunsheetTemplate } from '@/server-actions/rockEnsureRunsheetTemplate';

jest.mock('server-only', () => ({}));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn(), rockPost: jest.fn() }));
jest.mock('@/server-actions/rockBulkSaveRunsheetItems', () => ({ rockBulkSaveRunsheetItems: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockGet = jest.mocked(rockGet);
const mockPost = jest.mocked(rockPost);
const mockSave = jest.mocked(rockBulkSaveRunsheetItems);

function editor(campuses: string[]) {
  return { rolesMap: { editor: ['editor-1'] }, access: { runsheetCampuses: campuses } } as any;
}

describe('rockEnsureRunsheetTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue(editor(['MNL']));
  });

  it('returns the existing template, querying oldest-first by exact campus name', async () => {
    mockGet.mockResolvedValue([{ Id: 7 }]);

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res).toEqual({ success: true, id: 7 });
    const [url, params] = mockGet.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/ContentChannels');
    expect(params.$filter).toBe("ContentChannelTypeId eq 13 and Name eq 'MNL // Runsheet Master Template'");
    expect(params.$orderby).toBe('Id asc');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('creates and seeds the template when none exists', async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue(55);

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res).toEqual({ success: true, id: 55 });
    expect(mockPost).toHaveBeenCalledWith('/ContentChannels', expect.objectContaining({ Name: 'MNL // Runsheet Master Template' }));
    expect(mockSave).toHaveBeenCalledWith(55, expect.any(Array), []);
    expect((mockSave.mock.calls[0][1] as unknown[]).length).toBeGreaterThan(0);
  });

  it("denies an editor from another campus without touching Rock's channel list", async () => {
    mockSession.mockResolvedValue(editor(['BNE']));

    const res = await rockEnsureRunsheetTemplate('MNL');

    expect(res.success).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalledWith('/ContentChannels', expect.anything());
  });

  it('lets an all-campus user reach any campus template', async () => {
    mockSession.mockResolvedValue(editor(['ALL']));
    mockGet.mockResolvedValue([{ Id: 9 }]);

    expect(await rockEnsureRunsheetTemplate('SEL')).toEqual({ success: true, id: 9 });
  });

  it('rejects an unknown campus code', async () => {
    const res = await rockEnsureRunsheetTemplate('XYZ' as any);
    expect(res.success).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
```

Check the editor role key before running: `canUserEditRunsheet` in `src/lib/permissions.ts` decides which `rolesMap` entry grants edit. If `editor` isn't it, change the `editor()` helper to a role that `src/lib/permissions.test.ts` shows passing `canUserEditRunsheet`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm jest tests/unit/server-actions/rockEnsureRunsheetTemplate.test.ts`
Expected: FAIL. The current action takes no campus, uses the global name, and has no `$orderby`.

- [ ] **Step 3: Rewrite the action**

```ts
'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import { RUNSHEET_CAMPUS_CODES, type RunsheetCampusCode } from '@/lib/runsheetCampus';
import { buildDefaultTemplateItems, masterTemplateName } from '@/lib/runsheetTemplate';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

/**
 * Finds the campus's master template channel, creating and seeding it on
 * first use. The name carries the campus marker, so the standard edit gate
 * isolates campuses. Concurrent first use can create two channels; the
 * oldest always wins, so the duplicate is inert.
 */
export async function rockEnsureRunsheetTemplate(
  campus: RunsheetCampusCode,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!RUNSHEET_CAMPUS_CODES.includes(campus)) {
      return { success: false, error: 'Unknown campus.' };
    }

    const name = masterTemplateName(campus);
    const session = await getRockSession();
    const access = await assertRunsheetEditAccess(session, name);
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    const existing = (await rockGet('/ContentChannels', {
      $filter: `ContentChannelTypeId eq ${RUNSHEET_CONTENT_CHANNEL_TYPE_ID} and Name eq '${name}'`,
      $select: 'Id',
      $orderby: 'Id asc',
      $top: 1,
    })) as Array<{ Id: number }> | null;

    if (existing && existing.length > 0) {
      return { success: true, id: existing[0].Id };
    }

    const result = await rockPost('/ContentChannels', {
      Name: name,
      ContentChannelTypeId: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
      RequiresApproval: false,
      IsIndexEnabled: true,
      EnablePersonalization: true,
      IsStructuredContent: true,
      ItemsManuallyOrdered: true,
    });

    const channelId: number = typeof result === 'number' ? result : (result?.Id || result?.id || Number(result));
    if (!channelId || isNaN(channelId)) {
      throw new Error('Failed to retrieve new ContentChannel ID from Rock RMS response');
    }

    await rockBulkSaveRunsheetItems(channelId, buildDefaultTemplateItems(), []);

    return { success: true, id: channelId };
  } catch (err) {
    console.error('Error ensuring runsheet master template:', err);
    return { success: false, error: 'Failed to find or create master template.' };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest tests/unit/server-actions/rockEnsureRunsheetTemplate.test.ts && pnpm typecheck`
Expected: 5 PASS. Typecheck now **fails** in `RunsheetManager.tsx` and `rockCreateServiceRunsheet.ts` because they call the action without a campus. Tasks 3 and 5 fix those callers. If you want a green typecheck at this commit, add a temporary `// @ts-expect-error fixed in Task 3/5` at each old call site and remove it in those tasks.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/rockEnsureRunsheetTemplate.ts tests/unit/server-actions/rockEnsureRunsheetTemplate.test.ts \
  src/components/runsheet/RunsheetManager.tsx src/server-actions/rockCreateServiceRunsheet.ts
git commit -m "feat: scope runsheet master template to a campus

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Populate new runsheets from the campus template, with fallback

**Files:**
- Modify: `src/server-actions/rockCreateServiceRunsheet.ts` (the "3. populate" block, ~lines 63-83)
- Test: `tests/unit/server-actions/rockCreateServiceRunsheet.test.ts`

**Interfaces:**
- Consumes: `rockEnsureRunsheetTemplate(campus)` (Task 2); `buildDefaultTemplateItems()` (Task 1); `extractRunsheetCampus(title)`; `rockGetRunsheetDetails(channelId)` returns `{ success, data?: { items: RunsheetItemRow[] } }`; `SIBLINGKEY_ATTRIBUTE_KEY`.
- Produces: no new exports. `rockCreateServiceRunsheet` keeps its signature and return shape.

- [ ] **Step 1: Write the failing test**

```ts
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockEnsureRunsheetTemplate } from '@/server-actions/rockEnsureRunsheetTemplate';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import type { RunsheetItemRow } from '@/types/Runsheet';

jest.mock('server-only', () => ({}));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn(), rockPost: jest.fn() }));
jest.mock('@/server-actions/rockBulkSaveRunsheetItems', () => ({ rockBulkSaveRunsheetItems: jest.fn() }));
jest.mock('@/server-actions/rockEnsureRunsheetTemplate', () => ({ rockEnsureRunsheetTemplate: jest.fn() }));
jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({ rockGetRunsheetDetails: jest.fn() }));

const mockEnsure = jest.mocked(rockEnsureRunsheetTemplate);
const mockDetails = jest.mocked(rockGetRunsheetDetails);
const mockSave = jest.mocked(rockBulkSaveRunsheetItems);

const TITLE = 'MNL Crowne // October 4, 2026 // 10AM';

function savedItems(): RunsheetItemRow[] {
  return mockSave.mock.calls[0][1] as RunsheetItemRow[];
}

describe('rockCreateServiceRunsheet template population', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['MNL'] },
    } as any);
    jest.mocked(rockPost).mockResolvedValue(200);
  });

  it("copies the campus template's rows and blanks their sibling keys", async () => {
    mockEnsure.mockResolvedValue({ success: true, id: 7 });
    mockDetails.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 1, title: 'Welcome', order: 1, duration: 5, attributeValues: { SIBLINGKEY: 'abc', NOTES: 'hi' } },
          { id: 2, title: 'Favor News', order: 2, duration: 3, attributeValues: { SIBLINGKEY: 'def' } },
        ],
      },
    } as any);

    const res = await rockCreateServiceRunsheet(TITLE, 13);

    expect(res.success).toBe(true);
    expect(mockEnsure).toHaveBeenCalledWith('MNL');
    const items = savedItems();
    expect(items.map((i) => i.title)).toEqual(['Welcome', 'Favor News']);
    expect(items.every((i) => i.isNew && typeof i.id === 'string')).toBe(true);
    expect(items.map((i) => i.attributeValues?.SIBLINGKEY)).toEqual(['', '']);
    expect(items[0].attributeValues?.NOTES).toBe('hi');
    expect(items.map((i) => i.order)).toEqual([1, 2]);
  });

  it.each([
    ['ensure fails', () => mockEnsure.mockResolvedValue({ success: false, error: 'nope' })],
    ['load fails', () => {
      mockEnsure.mockResolvedValue({ success: true, id: 7 });
      mockDetails.mockResolvedValue({ success: false } as any);
    }],
    ['template is empty', () => {
      mockEnsure.mockResolvedValue({ success: true, id: 7 });
      mockDetails.mockResolvedValue({ success: true, data: { items: [] } } as any);
    }],
    ['ensure throws', () => mockEnsure.mockRejectedValue(new Error('boom'))],
  ])('falls back to the hardcoded default when %s', async (_label, arrange) => {
    arrange();

    const res = await rockCreateServiceRunsheet(TITLE, 13);

    expect(res.success).toBe(true);
    expect(savedItems()).toHaveLength(DEFAULT_RUNSHEET_TEMPLATE.length);
  });
});
```

Check `rockCreateServiceRunsheet`'s signature (`(title, contentChannelTypeId, categoryId?)`) and the edit-role key as in Task 2 before running. The spec's "campus-less title" fallback can't happen: the action already rejects titles without exactly one campus marker (`extractRunsheetCampuses(title).length !== 1`), so the code only needs a defensive fallback, not a test.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm jest tests/unit/server-actions/rockCreateServiceRunsheet.test.ts`
Expected: FAIL. The current code calls ensure with no campus, keeps `SIBLINGKEY`, and saves nothing on failure.

- [ ] **Step 3: Implement**

Replace the imports and the whole "3. Automatically populate" `try { … } catch { … }` block:

```ts
import { extractRunsheetCampus, extractRunsheetCampuses } from '@/lib/runsheetCampus';
import { buildDefaultTemplateItems } from '@/lib/runsheetTemplate';
import { SIBLINGKEY_ATTRIBUTE_KEY } from '@/constants/runsheetColumns';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
```

(Replace the existing `extractRunsheetCampuses` import line. Keep the `rockEnsureRunsheetTemplate` import. Drop the dynamic `await import('@/server-actions/rockGetRunsheetDetails')`.)

```ts
    // 3. Populate from the campus's master template, falling back to the
    //    hardcoded default so a new runsheet is never left empty.
    let preparedItems: RunsheetItemRow[] = [];
    try {
      preparedItems = await loadCampusTemplateItems(title);
    } catch (templateErr) {
      console.warn('Could not load campus master template, using default:', templateErr);
    }
    if (preparedItems.length === 0) preparedItems = buildDefaultTemplateItems();

    try {
      await rockBulkSaveRunsheetItems(channelId, preparedItems, []);
    } catch (templateErr) {
      console.warn('Could not populate initial template items:', templateErr);
    }
```

Add this module-private helper below the imports:

```ts
/** The campus template's rows as unsaved items, or [] if it can't be used. */
async function loadCampusTemplateItems(title: string): Promise<RunsheetItemRow[]> {
  const campus = extractRunsheetCampus(title);
  if (!campus) return [];

  const template = await rockEnsureRunsheetTemplate(campus);
  if (!template.success || !template.id) return [];

  const details = await rockGetRunsheetDetails(template.id);
  if (!details.success || !details.data) return [];

  const stamp = Date.now();
  return details.data.items.map((row, idx) => ({
    ...row,
    id: `new_${idx}_${stamp}`,
    isNew: true,
    changedKeys: undefined,
    order: idx + 1,
    // A fresh runsheet must not inherit the template's cross-service keys.
    attributeValues: { ...row.attributeValues, [SIBLINGKEY_ATTRIBUTE_KEY]: '' },
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest tests/unit/server-actions/rockCreateServiceRunsheet.test.ts && pnpm typecheck`
Expected: 5 PASS. The only remaining typecheck error should be in `RunsheetManager.tsx` (Task 5), or none if you used the Task 2 `@ts-expect-error`.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/rockCreateServiceRunsheet.ts tests/unit/server-actions/rockCreateServiceRunsheet.test.ts
git commit -m "feat: seed new runsheets from the campus master template

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Hide templates from the runsheet list

**Files:**
- Modify: `src/server-actions/rockGetAvailableRunsheetChannels.ts` (after the campus filter, ~line 93)
- Test: `tests/unit/server-actions/rockGetAvailableRunsheetChannels.test.ts`

**Interfaces:**
- Consumes: `isMasterTemplateName` (Task 1).
- Produces: `rockGetAvailableRunsheetChannels` never returns template channels. Everything downstream (landing list, `resolveSiblings`, propagation) inherits this.

- [ ] **Step 1: Write the failing test**

```ts
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

describe('rockGetAvailableRunsheetChannels', () => {
  it('never lists master template channels, even for all-campus users', async () => {
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['ALL'] },
    } as any);
    jest.mocked(rockGet).mockResolvedValue([
      { Id: 1, Name: 'MNL Crowne // October 4, 2099 // 10AM' },
      { Id: 2, Name: 'MNL // Runsheet Master Template' },
      { Id: 3, Name: 'Runsheet Master Template' },
    ]);

    const res = await rockGetAvailableRunsheetChannels(false);

    expect(res.success).toBe(true);
    expect(res.channels.map((c) => c.id)).toEqual([1]);
  });
});
```

Check the view/edit role key as in Task 2.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm jest tests/unit/server-actions/rockGetAvailableRunsheetChannels.test.ts`
Expected: FAIL. Channel 2 is included (it has a campus marker and no date, so the past-filter keeps it).

- [ ] **Step 3: Implement**

Add the import and a filter right after the campus-isolation filter:

```ts
import { isMasterTemplateName } from '@/lib/runsheetTemplate';
```

```ts
    // Master templates are opened via "Edit Master Template", never listed —
    // this also keeps them out of sibling resolution for propagation.
    available = available.filter((c) => !isMasterTemplateName(c.Name));
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest tests/unit/server-actions/rockGetAvailableRunsheetChannels.test.ts tests/unit/components/RunsheetLandingView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/rockGetAvailableRunsheetChannels.ts tests/unit/server-actions/rockGetAvailableRunsheetChannels.test.ts
git commit -m "feat: hide master templates from the runsheet list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Landing button with campus chooser

**Files:**
- Modify: `src/components/runsheet/RunsheetLandingView.tsx` (the `onEditTemplate` prop and the header button added by the WIP)
- Modify: `src/components/runsheet/RunsheetManager.tsx` (`handleEditTemplate`, ~lines 256-269; the `onEditTemplate` prop, ~line 421)
- Test: `tests/unit/components/RunsheetLandingView.test.tsx` (append)

**Interfaces:**
- Consumes: `rockEnsureRunsheetTemplate(campus)` (Task 2); `RUNSHEET_CAMPUS_CODES`, `ALL_CAMPUSES`, `RunsheetCampusCode` from `@/lib/runsheetCampus`; `user.access?.runsheetCampuses` (on `AuthUser`, already used by `getRunsheetAccessScope`).
- Produces:
  - `RunsheetLandingView` props: `onEditTemplate?: (campus: RunsheetCampusCode) => void` and `templateCampuses?: RunsheetCampusCode[]`
  - `RunsheetManager` passes `templateCampuses` = the user's campuses (all three for `ALL`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` in `RunsheetLandingView.test.tsx`. It already has a `renderLandingView(props)` helper that merges props.

```tsx
  it('opens the only campus template directly for a single-campus editor', () => {
    const onEditTemplate = jest.fn();
    renderLandingView({ onEditTemplate, templateCampuses: ['BNE'] });

    fireEvent.click(screen.getByRole('button', { name: /edit master template/i }));

    expect(onEditTemplate).toHaveBeenCalledWith('BNE');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers a campus choice when the editor spans several campuses', () => {
    const onEditTemplate = jest.fn();
    renderLandingView({ onEditTemplate, templateCampuses: ['MNL', 'BNE', 'SEL'] });

    fireEvent.click(screen.getByRole('button', { name: /edit master template/i }));
    expect(onEditTemplate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'SEL' }));
    expect(onEditTemplate).toHaveBeenCalledWith('SEL');
  });

  it('hides the button when the user has no campus template to edit', () => {
    renderLandingView({ onEditTemplate: jest.fn(), templateCampuses: [] });
    expect(screen.queryByRole('button', { name: /edit master template/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm jest tests/unit/components/RunsheetLandingView.test.tsx`
Expected: the 3 new tests FAIL (`templateCampuses` doesn't exist yet, and the button calls `onEditTemplate()` with no campus).

- [ ] **Step 3: Implement the landing view**

In `RunsheetLandingView.tsx`, change the props:

```ts
import type { RunsheetCampusCode } from '@/lib/runsheetCampus';
// …
  onEditTemplate?: (campus: RunsheetCampusCode) => void;
  /** Campuses whose master template this user may edit. */
  templateCampuses?: RunsheetCampusCode[];
```

Destructure `templateCampuses = []`, add `const [templateMenuOpen, setTemplateMenuOpen] = useState(false);` (import `useState` if it isn't already), and replace the WIP button block with:

```tsx
        {canEdit && onEditTemplate && templateCampuses.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-haspopup={templateCampuses.length > 1 ? 'menu' : undefined}
              aria-expanded={templateCampuses.length > 1 ? templateMenuOpen : undefined}
              onClick={() => {
                if (templateCampuses.length === 1) onEditTemplate(templateCampuses[0]);
                else setTemplateMenuOpen((open) => !open);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
            >
              <HiDocumentText className="h-4 w-4 text-slate-400" />
              <span>Edit Master Template</span>
            </button>
            {templateMenuOpen && templateCampuses.length > 1 && (
              <div role="menu" className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {templateCampuses.map((campus) => (
                  <button
                    key={campus}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTemplateMenuOpen(false);
                      onEditTemplate(campus);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {campus}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 4: Implement the manager**

In `RunsheetManager.tsx`:

```ts
import toast from 'react-hot-toast';
import { ALL_CAMPUSES, RUNSHEET_CAMPUS_CODES, type RunsheetCampusCode } from '@/lib/runsheetCampus';
```

(Skip any import that's already there.) Add next to `const accessScope = …`:

```ts
  const userCampuses = user?.access?.runsheetCampuses || [];
  const templateCampuses: RunsheetCampusCode[] = userCampuses.includes(ALL_CAMPUSES)
    ? RUNSHEET_CAMPUS_CODES
    : RUNSHEET_CAMPUS_CODES.filter((code) => userCampuses.includes(code));
```

Replace `handleEditTemplate`:

```ts
  const handleEditTemplate = async (campus: RunsheetCampusCode) => {
    try {
      const { rockEnsureRunsheetTemplate } = await import('@/server-actions/rockEnsureRunsheetTemplate');
      const res = await rockEnsureRunsheetTemplate(campus);
      if (res.success && res.id) {
        handleSelectChannel(res.id);
      } else {
        toast.error(res.error || 'Failed to load the master template.');
      }
    } catch (err) {
      console.error('Error loading master template:', err);
      toast.error('Failed to load the master template.');
    }
  };
```

And pass the campuses:

```tsx
          onEditTemplate={canEdit ? handleEditTemplate : undefined}
          templateCampuses={templateCampuses}
```

Remove any Task 2 `@ts-expect-error` here.

- [ ] **Step 5: Run tests**

Run: `pnpm jest tests/unit/components && pnpm typecheck`
Expected: all component tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/runsheet/RunsheetLandingView.tsx src/components/runsheet/RunsheetManager.tsx tests/unit/components/RunsheetLandingView.test.tsx
git commit -m "feat: open the campus master template from the landing page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Mark the template in the editor

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx` (header toolbar around the "Start:" input, ~line 2035)
- Test: `tests/unit/components/RunsheetTableEditor.layout.test.tsx` (append)

**Interfaces:**
- Consumes: `isMasterTemplateName` (Task 1); the editor's existing `channelName` prop.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Open `RunsheetTableEditor.layout.test.tsx` and reuse its existing render helper/props (it already renders the editor with a `channelName`). Append:

```tsx
  it('badges a master template and hides its start-time control', () => {
    renderEditor({ channelName: 'MNL // Runsheet Master Template' });

    expect(screen.getByText('Master Template')).toBeInTheDocument();
    expect(screen.queryByLabelText(/start/i)).not.toBeInTheDocument();
  });

  it('keeps the start-time control on ordinary runsheets', () => {
    renderEditor({ channelName: 'MNL Crowne // October 4, 2099 // 10AM' });

    expect(screen.queryByText('Master Template')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/start/i)).toBeInTheDocument();
  });
```

If the file's helper isn't called `renderEditor`, use whatever it is called and pass `channelName` the same way its existing tests do.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm jest tests/unit/components/RunsheetTableEditor.layout.test.tsx`
Expected: the first new test FAILS (no badge; the Start input is present).

- [ ] **Step 3: Implement**

```ts
import { isMasterTemplateName } from '@/lib/runsheetTemplate';
// inside the component, near other derived values:
  const isTemplate = isMasterTemplateName(channelName);
```

Wrap the existing Start block (the `<div …>` holding `<label htmlFor="runsheet-start-time">` and its input) so it renders only when `!isTemplate`, and put the badge before it:

```tsx
              {isTemplate && (
                <span className="rounded-md bg-pink-100 px-2 py-0.5 text-[11px] font-bold text-pink-800">
                  Master Template
                </span>
              )}
              {!isTemplate && (
                /* existing Start: label + input block, unchanged */
              )}
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest tests/unit/components && pnpm typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx tests/unit/components/RunsheetTableEditor.layout.test.tsx
git commit -m "feat: badge master templates in the runsheet editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Version bump and full verification

**Files:**
- Modify: `package.json` (`"version": "1.14.1"` → `"1.15.0"`)

- [ ] **Step 1: Confirm no leftovers**

```bash
grep -rn "MASTER_TEMPLATE_NAME\|alert(\|@ts-expect-error fixed in Task" src
```

Expected: no matches.

- [ ] **Step 2: Bump the version**

Edit `package.json`: `"version": "1.15.0"`.

- [ ] **Step 3: Full verification**

```bash
pnpm typecheck && pnpm test && npx eslint src/lib/runsheetTemplate.ts src/server-actions/rockEnsureRunsheetTemplate.ts \
  src/server-actions/rockCreateServiceRunsheet.ts src/server-actions/rockGetAvailableRunsheetChannels.ts \
  src/components/runsheet/RunsheetLandingView.tsx src/components/runsheet/RunsheetManager.tsx src/components/runsheet/RunsheetTableEditor.tsx
```

Expected: all clean, all tests pass.

- [ ] **Step 4: Manual check against rock-preview**

With `pnpm dev` against rock-preview:
1. As a single-campus (MNL) editor: "Edit Master Template" opens `MNL // Runsheet Master Template` and shows the badge. Add a row, then save.
2. Create a new MNL runsheet: it contains the added row.
3. The landing list shows no template channels.
4. As an all-campus user: the button shows MNL / BNE / SEL.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: release 1.15.0

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 1. Naming helpers + `buildDefaultTemplateItems` | 1 |
| 2. Per-campus ensure, oldest-wins, invalid campus | 2 |
| 3. Copy rows, blank `SIBLINGKEY`, fallback | 3 |
| 4. Hide templates from list and siblings | 4 |
| 5. Landing button, campus chooser, toasts, editor badge | 5, 6 |
| 6. User-safe errors, creation never fails on template | 2, 3 |
| 7. Tests + typecheck | every task, 7 |
| Delivery: separate commit, 1.14.1 then 1.15.0 | 0, 7 |
