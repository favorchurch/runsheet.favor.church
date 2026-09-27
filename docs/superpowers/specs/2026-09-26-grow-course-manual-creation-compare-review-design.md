# Grow Class Runsheets: Manual Creation, Compare & Course Review Design

**Date:** 2026-09-26  
**Status:** Approved  
**Author:** AI Pair Programmer / jerwyn

---

## 1. Problem Statement

1. **Unwanted Auto-Creation on Page Load:** Previously, visiting the runsheet application triggered `rockSyncGrowRunsheets` to automatically create runsheets in Rock RMS for all upcoming Grow course schedule dates. This created 29+ runsheets automatically without explicit user intent. Runsheet creation should be manual and intentional.
2. **Flexible Creation (1 Session vs. Full Course):** When creating a runsheet for a Grow class, a leader usually wants to create 1 runsheet for an upcoming date, but optionally needs the ability to batch-create runsheets for all upcoming sessions of that specific course.
3. **Cross-Session Compare & Review (Propagate):** Sunday/Youth runsheet siblings are scoped to the same date (e.g. 10AM, 3PM, 5PM on a given Sunday). Grow courses, however, run across successive dates/weeks (e.g. Week 1 on Oct 4, Week 2 on Oct 11, Week 3 on Oct 18). Currently, `resolveSiblings` returns `[]` for Grow courses because their dates differ. Consequently, leaders cannot use the **Compare View** or **Review & Propagate** panel to manage or compare sessions of the same Grow course.

---

## 2. Requirements & Goals

1. **Disable Auto-Sync on Mount:** Remove the automatic `rockSyncGrowRunsheets` invocation on component mount in `RunsheetManager.tsx`.
2. **Course-Aware Manual Creation:**
   - In `CreateRunsheetForm`, selecting a Grow class schedule defaults to creating **1 runsheet** for the selected date.
   - A toggle/checkbox allows: `[ ] Also create runsheets for all upcoming sessions of this course (<N> sessions)`.
   - If checked, submit creates runsheets for each scheduled date of that specific Grow course (skipping any dates that already exist).
3. **Course-Scoped Siblings & Review (Propagation):**
   - Update sibling resolution (`src/lib/runsheetSiblings.ts`):
     - For Sunday / Youth: Sibling matching remains same-campus, same-date.
     - For Grow runsheets: Runsheets that belong to the **same Grow course** (sharing the course title prefix before `//`) are identified as course siblings regardless of date.
   - When editing a Grow runsheet, the **Review & Propagate** panel will show changes against other sessions of that same course.
4. **Course-Scoped Compare View:**
   - In `RunsheetCompareView`, when opened from a Grow runsheet, the channel selector pre-filters or groups by the active Grow course, making it seamless to compare Week 1, Week 2, etc., side-by-side.

---

## 3. Detailed Architecture & Design

### 3.1 Disable Automatic Creation on Load
- In `src/components/runsheet/RunsheetManager.tsx`:
  - Remove `rockSyncGrowRunsheets` execution inside the `useEffect` on mount.
  - Retain `rockSyncGrowRunsheets` in server actions if needed or repurpose for explicit batch creation.

### 3.2 Create Form Updates (`CreateRunsheetForm.tsx`)
- Detect when the selected schedule is a Grow class schedule (either via `growOnly` prop, category 483, or matching schedule type).
- When a Grow schedule with multiple upcoming occurrences is selected:
  - Display a checkbox:
    `[ ] Create runsheets for all upcoming dates of this course (<Course Name>, <N> sessions)`
  - State: `batchCreateCourse: boolean` (defaults to `false`).
  - Upon submit:
    - If `batchCreateCourse === false`: Call `rockCreateServiceRunsheet` once for the selected date and navigate to the created runsheet.
    - If `batchCreateCourse === true`: Batch-create runsheets for all remaining scheduled dates of that course, skipping dates that already have an existing runsheet. Display a progress indicator / toast, then navigate to the first created runsheet.

### 3.3 Course-Scoped Sibling Resolution (`runsheetSiblings.ts`)
- Add a helper `isGrowRunsheet(name: string): boolean` or import `isGrowRunsheetTitle(name)` from `src/lib/runsheetKind.ts`.
- Add `extractGrowCoursePrefix(name: string): string | null` to extract the course title prefix before `//` (e.g. `"MNL Grow - Build x FDNA"`).
- In `resolveSiblings(sourceChannelId, sourceName, allChannels)`:
  - If `isGrowRunsheetTitle(sourceName)`:
    - Extract course prefix `prefix = extractGrowCoursePrefix(sourceName)`.
    - Find all other runsheets in `allChannels` with `extractGrowCoursePrefix(c.name) === prefix`.
    - Map them to `SiblingChannel[]`, sorting chronologically by date.
  - Else:
    - Retain existing same-campus, same-date logic.

### 3.4 Compare View Scoping (`RunsheetCompareView.tsx`)
- When `availableChannels` is passed into `RunsheetCompareView`:
  - If comparing a Grow runsheet, group or sort candidate channels belonging to the same Grow course first, or pre-filter selection buttons to channels of that course so the user can easily compare across the course sessions.

---

## 4. Verification & Testing

1. **Unit Tests**:
   - `resolveSiblings.test.ts`: Verify that Grow runsheets match other dates of the same course as siblings, while Sunday runsheets continue matching same-date.
   - `CreateRunsheetForm.test.tsx`: Verify the batch checkbox appears for Grow schedules, defaults to false (1 runsheet), and triggers single vs batch creation appropriately.
   - `RunsheetManager.test.tsx`: Verify no automatic background creation fires on mount.
2. **Typecheck & Linting**: Run `pnpm typecheck` and `pnpm lint`.
3. **Full Suite**: Run `pnpm test` (all 405+ tests pass).
4. **Semver**: Bump version according to semver (`1.16.3`).
