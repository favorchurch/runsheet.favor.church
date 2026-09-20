# Implementation Plan: Runsheet Enhancements

**Tracking Map:** [#51](https://github.com/favorchurch/runsheet.favor.church/issues/51)
**Sub-Issues:** [#52](https://github.com/favorchurch/runsheet.favor.church/issues/52), [#53](https://github.com/favorchurch/runsheet.favor.church/issues/53), [#54](https://github.com/favorchurch/runsheet.favor.church/issues/54), [#55](https://github.com/favorchurch/runsheet.favor.church/issues/55), [#56](https://github.com/favorchurch/runsheet.favor.church/issues/56)
**Worktree:** `.worktrees/runsheet-enhancements` (`feat/runsheet-enhancements`)

---

## 1. Context

This plan delivers five enhancements to the Favor Church Runsheet application (`runsheet.favor.church`):
1. **Compare Start Time**: Include service start time in the comparison column headers and calculated segment start times and durations in the row comparison view.
2. **Cell URL / File Reference**: Allow adding a URL/file reference to any cell during editing. Render a clickable footer chip in view mode that opens the file/URL in a new tab without entering cell edit mode.
3. **Multi-line Enter in Cell Editing**: Update cell editing so <kbd>Enter</kbd> (along with <kbd>Shift</kbd>+<kbd>Enter</kbd> and <kbd>Cmd</kbd>+<kbd>Enter</kbd>) inserts a newline rather than closing/committing the cell. Exiting/committing is done via blur / clicking outside or pressing <kbd>Escape</kbd>.
4. **Relocate View/Edit Buttons**: Move the View / Edit mode buttons out of the runsheet selection card to the right side of the sticky event card header (where the Card/Table toggle was).
5. **Relocate Event Team Roster Pane & Card/Table Toggle**: Place the "Event Team Roster" pane below the runsheet selector and above the runsheet title. Move the Card / Table toggle above the table, floated to the right of "RUNSHEET SCHEDULE (X segments)".

---

## 2. Global Constraints & Pinned Interfaces

### Blast Radius Ceiling
- **Permitted**: Files under `src/` and `tests/` in the isolated git worktree `.worktrees/runsheet-enhancements`.
- **Forbidden**: No live production mutations during test execution (all Rock API calls mocked in unit tests). No edits to Auth0 / authentication routes. No schema changes to Rock RMS server entities outside standard attribute string storage.

### Pinned Interfaces (Verbatim)

```ts
// src/components/runsheet/RunsheetCompareView.tsx:14-30
interface RunsheetCompareViewProps {
  channelIds: number[];
  availableChannels?: RunsheetChannelOption[];
  onSelectionChange?: (channelIds: number[]) => void;
  onClose: () => void;
  readOnly?: boolean;
  onSaveSettled?: (channelId: number) => void;
}

interface LoadedSheet {
  channelId: number;
  name: string;
  time: string;
  startTime?: string;
  columns: DynamicAttributeColumn[];
  items: RunsheetItemRow[];
}

// src/server-actions/rockGetRunsheetDetailsBatch.ts:6-21
export interface BatchRunsheetResult {
  channelId: number;
  success: boolean;
  data?: RunsheetDetails;
  error?: string;
}
export async function rockGetRunsheetDetailsBatch(channelIds: number[]): Promise<BatchRunsheetResult[]>

// src/components/runsheet/RichTextCell.tsx:39-46
interface RichTextCellProps {
  value: string;
  onChange: (html: string) => void;
  onCommit: () => void;
  onEditorChange: (editor: Editor | null) => void;
}

// src/lib/richText.ts:13-31
export const RICH_TEXT_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'span', 'ul', 'ol', 'li', 'a'
] as const;
export const RICH_TEXT_ALLOWED_ATTR = ['style', 'href', 'target', 'rel', 'data-cell-url', 'class'] as const;

export function legacyValueToHtml(value: string): string;
export function htmlToPlainText(value: string): string;
export function normalizeRichTextValue(value: string): string;
export function extractCellUrl(value: string): { contentHtml: string; url: string | null };
export function embedCellUrl(contentHtml: string, url: string | null): string;

// src/components/runsheet/RichTextContent.tsx:16-19
interface RichTextContentProps {
  value: string;
  className?: string;
}
```

---

## 3. Numbered Tasks

### Task 1: Multi-line Enter in Cell Editing (`#54`)
- **Strategy:** `PRO`
- **Touches:** `src/components/runsheet/RichTextCell.tsx`, `tests/unit/components/RichTextCell.test.tsx`
- **Details:**
  - In `RichTextCell.tsx` `handleKeyDown`:
    - When `event.key === 'Enter'`, if `event.metaKey || event.ctrlKey || event.shiftKey` or plain `Enter`, prevent default and execute `editorRef.current?.chain().focus().setHardBreak().run()`.
    - Do NOT call `onCommitRef.current()` on Enter.
    - Leave `Escape` handling calling `onCommitRef.current()`.
  - Add/update unit tests verifying that pressing Enter, Shift+Enter, and Cmd+Enter all insert newlines and do not fire `onCommit`.

### Task 2: Cell URL / File Reference Support (`#53`)
- **Strategy:** `PRO`
- **Touches:**
  - `src/lib/richText.ts`
  - `src/lib/sanitizeRichText.ts`
  - `src/components/runsheet/RichTextCell.tsx`
  - `src/components/runsheet/RichTextContent.tsx`
  - `src/components/runsheet/RunsheetTableEditor.tsx`
  - `tests/unit/lib/richText.test.ts`
  - `tests/unit/components/RichTextContent.test.tsx`
- **Details:**
  - Add `'a'` to `RICH_TEXT_ALLOWED_TAGS` and `['style', 'href', 'target', 'rel', 'data-cell-url', 'class']` to `RICH_TEXT_ALLOWED_ATTR`.
  - Implement `extractCellUrl(raw: string): { contentHtml: string; url: string | null }` and `embedCellUrl(contentHtml: string, url: string | null): string`.
  - In `RichTextCell.tsx`: Add a compact URL input field at the bottom of the editor with an attachment link icon and a clear button. When updated, combine content HTML + URL and trigger `onChange`.
  - In `RichTextContent.tsx` & `RunsheetTableEditor.tsx`: Render the text content, and if a URL is present, render a compact footer chip with link icon (🔗) and domain/truncated URL.
  - Clicking the chip in view mode calls `window.open(url, '_blank')` and stops event propagation (`e.stopPropagation()`) so the cell does not enter edit mode.

### Task 3: Compare View Start Time & Segment Timelines (`#52`)
- **Strategy:** `PRO`
- **Touches:**
  - `src/components/runsheet/RunsheetCompareView.tsx`
  - `tests/unit/components/RunsheetCompareView.test.tsx`
- **Details:**
  - Include `startTime: r.data?.startTime` in `LoadedSheet` mapping from `rockGetRunsheetDetailsBatch`.
  - In comparison table column headers, display the service start time badge (e.g. `10:00:00 AM`).
  - Calculate item start times and durations across each sheet using `parseTimeToMinutes` and duration accumulation.
  - In segment rows, include `Start Time` and `Duration` comparison rows so timing discrepancies across services are clearly identified and highlighted if differing.

### Task 4: Layout Reorganization: View/Edit Buttons & Event Team Roster (`#55`, `#56`)
- **Strategy:** `PRO`
- **Touches:**
  - `src/components/runsheet/RunsheetManager.tsx`
  - `src/components/runsheet/RunsheetTableEditor.tsx`
  - `tests/unit/components/RunsheetTableEditor.layout.test.tsx`
  - `tests/unit/components/RunsheetManager.test.tsx`
- **Details:**
  - Remove View / Edit button group from `RunsheetManager.tsx`'s top runsheet selector card.
  - Render the View / Edit button group in `RunsheetTableEditor.tsx`'s sticky header on the right side next to `Start:` time input.
  - Move the Card / Table view toggle from the sticky header to ABOVE the table, right-aligned next to `"RUNSHEET SCHEDULE"`.
  - Move `EventTeamRosterCard` so it renders below the runsheet selector and above the `RunsheetTableEditor` title container.
  - Ensure sticky offset and sticky header continue to pin smoothly below the app header when scrolling.

---

## 4. Dependency Graph & Waves

```
Wave 1 (Foundation): Task 1 (Enter Newline) + Task 2 (Cell URL data & UI)
Wave 2 (Compare):   Task 3 (Compare View Start Times & Timeline)
Wave 3 (Layout):    Task 4 (View/Edit buttons, Event Team Roster, Card/Table toggle)
```

---

## 5. Verification Commands

```bash
# In .worktrees/runsheet-enhancements
npm test
npm run lint
npm run build
```

---

## 6. Routing Declaration

- **Routing:** 1 agy dispatch (`gemini-3.7-flash-high`) across all waves.
- **Verification:** Mandatory Phase 2b verification pass by Planner before Phase 3 adversarial review.
