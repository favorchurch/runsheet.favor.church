# Event Team Roster & UI Color Palette Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Event Team Roster card at the top of the Runsheet Editor with 8 vital manual roles and 5 auto-extracted platform roles, and update the UI color palette to remove purple/violet colors.

**Architecture:** A dedicated `EventTeamRosterCard` component is rendered at the top of `RunsheetTableEditor.tsx` in both Table and Cards view. The 8 vital roles (`Service Director`, `Service Producer`, `Stage Manager Captain`, `Music Director`, `Offstage Director`, `Worship Leaders`, `Host Core Cap`, `Security Lead`) are stored as `Roster: <Role Name>` items in Rock RMS and filtered out of schedule calculations (`processedRows`). The 5 platform roles (`Huddle Hype`, `MC 1`, `MC 2`, `Preacher`, `Wrap/Up Announcements`) are dynamically computed from schedule items. All purple/violet Tailwind colors are updated to sleek Indigo and Slate accents.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Rock RMS REST API.

## Global Constraints
- Vital Roles: Service Director, Service Producer, Stage Manager Captain, Music Director, Offstage Director, Worship Leaders, Host Core Cap, Security Lead.
- Internal Roster Title Prefix: `Roster: <Role Name>`.
- Internal Roster Order Range: `-100` to `-93`.
- Theme Rule: No purple/violet gradients or classes (`violet-*`, `#6d28d9`, etc.) — use Indigo (`indigo-*`), Slate (`slate-*`), and Pink (`pink-*`).

---

### Task 1: Create Event Team Roster Component & Auto-Extraction Helpers

**Files:**
- Create: `src/components/runsheet/EventTeamRosterCard.tsx`
- Test: `tests/unit/components/EventTeamRosterCard.test.ts` (or jest test)

**Interfaces:**
- Consumes: `RunsheetItemRow`, `DynamicAttributeColumn` from `@/types/Runsheet`
- Produces: `EventTeamRosterCard` component, `VITAL_ROLES` constant, `computePlatformRoles` function, `ensureRosterItems` helper

- [ ] **Step 1: Write unit tests for Roster helpers**

Create `tests/unit/components/EventTeamRosterCard.test.ts`:
```typescript
import { computePlatformRoles, extractPeopleFromRow } from '@/components/runsheet/EventTeamRosterCard';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('EventTeamRosterCard helpers', () => {
  const columns: DynamicAttributeColumn[] = [
    { id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
    { id: 2, key: 'DESCRIPTION', name: 'Detail' },
  ];

  it('extracts people from row correctly', () => {
    const row: RunsheetItemRow = {
      id: 101,
      title: 'All-In Huddle',
      order: 1,
      duration: 15,
      attributeValues: { PLATFORM: 'Jerwyn (Guest), John Doe' },
    };
    const names = extractPeopleFromRow(row, columns);
    expect(names).toEqual(['Jerwyn', 'John Doe']);
  });

  it('computes platform roles dynamically from schedule items', () => {
    const items: RunsheetItemRow[] = [
      { id: 1, title: 'All-In Huddle', order: 1, duration: 15, attributeValues: { PLATFORM: 'Jerwyn' } },
      { id: 2, title: 'MC1', order: 2, duration: 3, attributeValues: { PLATFORM: 'Sarah' } },
      { id: 3, title: 'MC2', order: 3, duration: 5, attributeValues: { PLATFORM: 'Mike' } },
      { id: 4, title: 'Sermon', order: 4, duration: 45, attributeValues: { PLATFORM: 'Pastor Paul' } },
      { id: 5, title: 'Wrap-up & Announcements', order: 5, duration: 2, detail: 'Next steps & closing prayer', attributeValues: {} },
    ];

    const platform = computePlatformRoles(items, columns);
    expect(platform.huddleHype).toBe('Jerwyn');
    expect(platform.mc1).toBe('Sarah');
    expect(platform.mc2).toBe('Mike');
    expect(platform.preacher).toBe('Pastor Paul');
    expect(platform.wrapText).toBe('Next steps & closing prayer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL (module `@/components/runsheet/EventTeamRosterCard` not found)

- [ ] **Step 3: Implement EventTeamRosterCard component and helpers**

Create `src/components/runsheet/EventTeamRosterCard.tsx`:
```tsx
'use client';

import React from 'react';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { isPersonColumn, parsePeopleString } from './PeopleSearchDropdown';
import { HiUserGroup, HiSparkles, HiPencilSquare } from 'react-icons/hi2';

export const VITAL_ROLES = [
  'Service Director',
  'Service Producer',
  'Stage Manager Captain',
  'Music Director',
  'Offstage Director',
  'Worship Leaders',
  'Host Core Cap',
  'Security Lead',
] as const;

export function extractPeopleFromRow(item: RunsheetItemRow, columns: DynamicAttributeColumn[]): string[] {
  const names: string[] = [];
  columns.forEach((col) => {
    if (isPersonColumn(col)) {
      const val = item.attributeValues?.[col.key] || '';
      if (val) {
        parsePeopleString(val).forEach((p) => {
          if (p.name && !names.includes(p.name)) {
            names.push(p.name);
          }
        });
      }
    }
  });
  return names;
}

export function computePlatformRoles(items: RunsheetItemRow[], columns: DynamicAttributeColumn[]) {
  const findRow = (queries: string[]) => {
    return items.find((item) => {
      const cleanTitle = (item.title || '').replace(/<[^>]*>/g, '').toLowerCase().trim();
      return queries.some((q) => cleanTitle.includes(q.toLowerCase()));
    });
  };

  const huddleRow = findRow(['all-in huddle']);
  const mc1Row = findRow(['mc1', 'mc 1']);
  const mc2Row = findRow(['mc2', 'mc 2']);
  const preacherRow = findRow(['sermon', 'preacher']);
  const wrapRow = findRow(['wrap-up', 'wrap/up', 'announcements']);

  return {
    huddleHype: huddleRow ? extractPeopleFromRow(huddleRow, columns).join(', ') : '',
    mc1: mc1Row ? extractPeopleFromRow(mc1Row, columns).join(', ') : '',
    mc2: mc2Row ? extractPeopleFromRow(mc2Row, columns).join(', ') : '',
    preacher: preacherRow ? extractPeopleFromRow(preacherRow, columns).join(', ') : '',
    wrapText: wrapRow ? (wrapRow.detail || '').replace(/<[^>]*>/g, '').trim() : '',
  };
}

export function ensureRosterItems(items: RunsheetItemRow[]): RunsheetItemRow[] {
  const updated = [...items];
  VITAL_ROLES.forEach((role, idx) => {
    const title = `Roster: ${role}`;
    const exists = updated.some((item) => item.title === title);
    if (!exists) {
      updated.push({
        id: `new_roster_${role.replace(/\s+/g, '_')}`,
        title,
        order: -100 + idx,
        duration: 0,
        attributeValues: {},
        isNew: true,
      });
    }
  });
  return updated;
}

interface EventTeamRosterCardProps {
  items: RunsheetItemRow[];
  columns: DynamicAttributeColumn[];
  readOnly?: boolean;
  editingRoleTitle: string | null;
  onOpenRolePicker: (roleTitle: string) => void;
}

export function EventTeamRosterCard({
  items,
  columns,
  readOnly = false,
  editingRoleTitle,
  onOpenRolePicker,
}: EventTeamRosterCardProps) {
  const platform = computePlatformRoles(items, columns);
  const personCol = columns.find(isPersonColumn) || columns[0] || { key: 'PLATFORM' };

  const getRosterValue = (role: string) => {
    const title = `Roster: ${role}`;
    const row = items.find((item) => item.title === title);
    return row?.attributeValues?.[personCol.key] || '';
  };

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 shadow-xs mb-3">
      {/* Card Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
          <HiUserGroup className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Event Team Roster</h3>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Vital service roles & platform schedule contacts at a glance</p>
        </div>
      </div>

      {/* Vital Event Roles Grid */}
      <div className="mb-4">
        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 mb-2">
          Vital Roles (Assigned Team)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {VITAL_ROLES.map((role) => {
            const val = getRosterValue(role);
            const isEditing = editingRoleTitle === `Roster: ${role}`;

            return (
              <div
                key={role}
                onClick={() => !readOnly && onOpenRolePicker(`Roster: ${role}`)}
                className={`relative flex flex-col justify-between rounded-lg border p-2.5 transition-all ${
                  isEditing
                    ? 'border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-500 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
                } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{role}</span>
                  {!readOnly && <HiPencilSquare className="h-3 w-3 text-slate-400" />}
                </div>
                <div className="text-xs font-semibold text-slate-900 break-words">
                  {val ? (
                    <span className="inline-flex flex-wrap items-center gap-1 font-bold text-indigo-950">
                      {val}
                    </span>
                  ) : (
                    <span className="text-[11px] italic font-normal text-slate-400">
                      {readOnly ? 'Unassigned' : '+ Attach person...'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform & Schedule Contacts Grid */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <HiSparkles className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
            Platform Roles (Auto-populated from Schedule)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Huddle Hype</span>
            <span className="font-semibold text-slate-900">{platform.huddleHype || <em className="text-slate-400 font-normal text-[11px]">None in All-In Huddle</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MC 1</span>
            <span className="font-semibold text-slate-900">{platform.mc1 || <em className="text-slate-400 font-normal text-[11px]">None in MC1</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MC 2</span>
            <span className="font-semibold text-slate-900">{platform.mc2 || <em className="text-slate-400 font-normal text-[11px]">None in MC2</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Preacher</span>
            <span className="font-semibold text-slate-900">{platform.preacher || <em className="text-slate-400 font-normal text-[11px]">None in Sermon</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Wrap/Up Announcements</span>
            <span className="font-semibold text-slate-900 truncate block">{platform.wrapText || <em className="text-slate-400 font-normal text-[11px]">None in Wrap-up</em>}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS (18 existing + 2 new unit tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/EventTeamRosterCard.tsx tests/unit/components/EventTeamRosterCard.test.ts
git commit -m "feat: add EventTeamRosterCard component and roster auto-extraction helpers"
```

---

### Task 2: Integrate Roster into RunsheetTableEditor & Save Pipeline

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx`

- [ ] **Step 1: Ensure initial state and template building include roster items**

In `src/components/runsheet/RunsheetTableEditor.tsx`:
1. Import `EventTeamRosterCard`, `ensureRosterItems`, and `VITAL_ROLES` from `./EventTeamRosterCard`.
2. Wrap initial `items` state in `ensureRosterItems()`:
```typescript
  const [items, setItems] = useState<RunsheetItemRow[]>(() =>
    ensureRosterItems(initialTemplate ? initialTemplate.templateRows : initialItems)
  );
```
3. Update `applyDefaultTemplate()` to retain existing roster items:
```typescript
  const applyDefaultTemplate = () => {
    saveSnapshot();
    const { templateRows, templateMusicMap } = buildTemplateState();
    const rosterItems = items.filter((item) => item.title?.startsWith('Roster:'));
    setDeletedIds((previous) => [...previous, ...items.filter((i) => !i.title?.startsWith('Roster:')).map((item) => item.id)]);
    setItems(ensureRosterItems([...templateRows, ...rosterItems]));
    setMusicCellMap(templateMusicMap);
    setEditingCell(null);
    setIsDirty(true);
    setStatus({ type: 'idle' });
  };
```
4. Filter out `Roster:` items from `processedRows` computation:
```typescript
  const runsheetItemsOnly = useMemo(() => {
    return items.filter((item) => !(item.title && item.title.startsWith('Roster:')));
  }, [items]);
```
Use `runsheetItemsOnly` inside `processedRows` loop instead of raw `items`.

- [ ] **Step 2: Update handleSave to include roster metadata items**

In `handleSave` inside `RunsheetTableEditor.tsx`:
```typescript
  const handleSave = React.useCallback(async (): Promise<boolean> => {
    if (readOnly) return false;
    setStatus({ type: 'saving' });
    setEditingCell(null);

    const runsheetPreparedItems = processedRows.map((row) => ({ ...row, startDateTime: row.calculatedStart }));
    const rosterPreparedItems = items.filter((item) => item.title && item.title.startsWith('Roster:'));
    const preparedItems = [...runsheetPreparedItems, ...rosterPreparedItems];

    const result = await rockBulkSaveRunsheetItems(channelId, preparedItems, deletedIds, columns);
```

- [ ] **Step 3: Render EventTeamRosterCard at the top of the Runsheet Editor**

Render `<EventTeamRosterCard ... />` directly above the Spreadsheet Table / Cards view.
Support opening `PeopleSearchDropdown` when a vital role card is clicked by setting `editingCell` to `{ rowIndex: itemIndex, key: personKey }`.

- [ ] **Step 4: Run typecheck to verify compiler passes**

Run: `pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "feat: integrate EventTeamRosterCard into RunsheetTableEditor and save pipeline"
```

---

### Task 3: Theme Refinement — Replace Purple/Violet Colors

**Files:**
- Modify: `src/components/runsheet/SongSearchDropdown.tsx`
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx`
- Modify: `src/components/runsheet/RichTextToolbar.tsx`
- Modify: `src/app/api/song/route.ts`

- [ ] **Step 1: Replace violet classes in SongSearchDropdown.tsx**

Replace `violet-*` classes with `indigo-*` or `slate-*` (e.g. `border-indigo-200`, `bg-indigo-600`, `text-indigo-900`, `hover:bg-indigo-50`, `bg-indigo-700`).

- [ ] **Step 2: Replace violet classes in RunsheetTableEditor.tsx**

Replace all remaining `violet-*` classes on Music Cell buttons and tags with `indigo-*` or `pink-*` (e.g., `bg-indigo-600`, `ring-indigo-400`, `bg-indigo-50/90`, `text-indigo-950`).

- [ ] **Step 3: Update RichTextToolbar.tsx color options**

Replace `{ label: 'Violet', value: '#6d28d9' }` with `{ label: 'Indigo', value: '#4f46e5' }` and swatch values.

- [ ] **Step 4: Update /api/song/route.ts HTML template classes**

Replace `violet-*` HTML string classes with `indigo-*` / `slate-*`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS with 0 errors and all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/runsheet/SongSearchDropdown.tsx src/components/runsheet/RunsheetTableEditor.tsx src/components/runsheet/RichTextToolbar.tsx src/app/api/song/route.ts
git commit -m "style: replace purple/violet UI colors with indigo and slate accents"
```

---

## Execution Choice
Plan complete and saved to `docs/superpowers/plans/2026-08-11-event-team-roster.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch fresh subagents per task, review between tasks.
2. **Inline Execution** - Execute tasks sequentially in this session using `executing-plans`.

Which approach?
