# Grow Class Runsheets: Manual Creation, Compare & Course Review Implementation Plan

**Goal:** Remove automatic Grow runsheet generation on load, allow optional batch-creation of all upcoming course sessions from the Create form, and enable course-scoped Compare and Review/Propagate across all sessions of the same Grow course.

**Spec:** `docs/superpowers/specs/2026-09-26-grow-course-manual-creation-compare-review-design.md`

---

## Global Constraints & Patterns

1. **Title Convention**: Grow runsheets follow `<Grow schedule name> // <Month D, YYYY> // <time>`. The course prefix is everything before the first `//` (trimmed).
2. **Rock API Hygiene**: Never call `/Categories/CategoryItem` (does not exist in Rock RMS).
3. **No Auto-Creation**: Runsheet creation must only occur when a user explicitly initiates it.
4. **Semver**: Update version per semver in `package.json` (`1.16.3`).
5. **Testing**: Every task must end with tests passing (`pnpm test` and `pnpm typecheck`).

---

## Tasks

### Task 1: Disable Auto-Creation on Mount

**Files:**
- Modify: `src/components/runsheet/RunsheetManager.tsx`
- Modify: `tests/unit/components/RunsheetManager.grow.test.tsx` (or existing tests asserting mount sync)

**Steps:**
1. In `src/components/runsheet/RunsheetManager.tsx`, remove the `useEffect` that calls `rockSyncGrowRunsheets` on mount (lines ~98–112).
2. Update tests in `tests/unit/components/` that asserted `rockSyncGrowRunsheets` was called on mount.
3. Run `pnpm test` to verify no failures.
4. Commit: `fix: remove automatic Grow runsheet creation on mount`.

---

### Task 2: Course-Scoped Sibling Detection for Grow Runsheets

**Files:**
- Modify: `src/lib/runsheetSiblings.ts`
- Modify: `tests/unit/lib/runsheetSiblings.test.ts`

**Context:**
`resolveSiblings(sourceChannelId, sourceName, allChannels)` currently requires `extractChannelDate(c.name).getTime() === sourceDate.getTime()`. This works for Sunday services on the same date, but fails for Grow courses whose sessions occur across different weeks.

**Steps:**
1. In `src/lib/runsheetSiblings.ts`:
   - Import `isGrowRunsheetTitle` from `@/lib/runsheetKind`.
   - Export helper `extractCourseTitle(title: string): string` which returns `title.split('//')[0]?.trim() || title`.
   - In `resolveSiblings`:
     - If `isGrowRunsheetTitle(sourceName)`:
       - Extract `sourceCourse = extractCourseTitle(sourceName)`.
       - Filter `allChannels` where `c.id !== sourceChannelId && extractCourseTitle(c.name) === sourceCourse`.
       - Map to `SiblingChannel`, with `preselected: true`, sorted chronologically by date.
     - Else:
       - Retain existing same-campus, same-date logic.
2. In `tests/unit/lib/runsheetSiblings.test.ts`:
   - Add tests verifying Grow runsheets match other dates of the same course as siblings.
   - Verify Sunday services continue matching only same-date siblings.
3. Run `pnpm test` and `pnpm typecheck`.
4. Commit: `feat: resolve Grow course runsheet siblings across dates`.

---

### Task 3: Course-Scoped Compare View Selection

**Files:**
- Modify: `src/components/runsheet/RunsheetCompareView.tsx`
- Modify: `src/components/runsheet/RunsheetManager.tsx`
- Modify: `tests/unit/components/RunsheetCompareView.test.tsx`

**Context:**
When a user clicks "Compare" while on a Grow runsheet, the channel selection buttons should prioritize or filter to runsheets of the same Grow course, allowing immediate side-by-side comparison across course dates.

**Steps:**
1. In `src/components/runsheet/RunsheetManager.tsx`:
   - When launching Compare from a Grow runsheet:
     - Find available channels that share the same course prefix.
     - Set initial `compareSelection` to the active channel plus the next session of the same course (if available).
2. In `src/components/runsheet/RunsheetCompareView.tsx`:
   - If the first loaded sheet is a Grow runsheet, display a badge or filter indicating "Comparing: <Course Name>", and prioritize buttons for sessions of that course.
3. Add unit tests verifying compare initialization for Grow courses.
4. Run `pnpm test` and `pnpm typecheck`.
5. Commit: `feat: scope Compare view to same Grow course sessions`.

---

### Task 4: Course Batch Creation Option in Create Form

**Files:**
- Modify: `src/components/runsheet/CreateRunsheetForm.tsx`
- Modify: `tests/unit/components/CreateRunsheetForm.grow.test.tsx`

**Context:**
When creating a runsheet for a Grow class schedule, the user creates 1 runsheet by default for the selected date. An optional checkbox allows creating runsheets for all upcoming dates of that schedule.

**Steps:**
1. In `src/components/runsheet/CreateRunsheetForm.tsx`:
   - When a Grow schedule is selected (e.g. `growOnly === true` or schedule category 483) and it has multiple upcoming occurrences:
     - Render a checkbox: `Also create runsheets for all upcoming sessions of this course (<N> sessions)`.
     - State `createAllSessions: boolean` (defaults to `false`).
   - On submit:
     - If `createAllSessions` is `false`: Call `rockCreateServiceRunsheet` once for the selected date.
     - If `createAllSessions` is `true`:
       - Loop through all upcoming occurrence dates for the selected schedule.
       - Skip any dates that already exist in `existingChannels`.
       - Create each runsheet using `rockCreateServiceRunsheet`.
       - Show a toast summary (e.g. `Created 4 runsheets for <Course Name>`).
2. Update unit tests in `tests/unit/components/CreateRunsheetForm.grow.test.tsx`:
   - Test that the checkbox renders for Grow schedules and defaults to unchecked.
   - Test single creation when unchecked.
   - Test batch creation when checked.
3. Run `pnpm test` and `pnpm typecheck`.
4. Commit: `feat: support optional batch creation of upcoming course sessions in Create form`.

---

### Task 5: Bump Semver to 1.16.3 and Final Verification

**Files:**
- Modify: `package.json`

**Steps:**
1. Bump version to `1.16.3` in `package.json`.
2. Run full test suite: `pnpm test`.
3. Run typecheck: `pnpm typecheck`.
4. Run lint: `pnpm lint`.
5. Commit: `chore: release 1.16.3`.
