# Runsheet Editor UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 key Runsheet Editor enhancements: sticky top toolbar, Excel-style inline row insertion (above/below), runsheet subtitle highlights field, and fix TipTap text cursor mouse placement.

**Architecture:** Extend `RunsheetTableEditor.tsx` layout and row controls, add subtitle metadata state, wrap top toolbar elements in sticky containers, and stop event propagation in `RichTextCell.tsx`.

**Tech Stack:** Next.js, React, Tailwind CSS, TipTap Editor, Rock RMS API.

## Global Constraints
- High-contrast Black / Slate Gray design palette (`bg-slate-900`, `slate-100`, `border-slate-200`).
- No purple or violet gradients.
- Preserve backward compatibility for all Rock RMS REST API payloads.

---

### Task 1: Mouse Pointer Text Cursor Placement Fix in TipTap RichTextCell

**Files:**
- Modify: `src/components/runsheet/RichTextCell.tsx:140-146`
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx:850-890`

**Interfaces:**
- Consumes: TipTap Editor instance and cell container event handlers.
- Produces: Smooth mouse text pointer placement without focus reset.

- [ ] **Step 1: Update RichTextCell.tsx to stop mouse event propagation**

```tsx
return (
  <div
    ref={containerRef}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    className="w-full h-full min-h-[28px] rounded-none border-2 border-blue-600 bg-white shadow-xs focus-within:outline-none flex flex-col justify-center"
  >
    <EditorContent editor={editor} />
  </div>
);
```

- [ ] **Step 2: Guard handleCellClick in RunsheetTableEditor.tsx**

```tsx
const handleCellClick = (rowIndex: number, key: string) => {
  if (readOnly) return;
  if (editingCell?.rowIndex === rowIndex && editingCell?.key === key) return;
  setEditingCell({ rowIndex, key });
};
```

- [ ] **Step 3: Run typecheck & tests to verify fix**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/runsheet/RichTextCell.tsx src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "fix: stop mouse event propagation in RichTextCell to fix text cursor placement"
```

---

### Task 2: Sticky Locked Top Toolbar & Column Headers

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx:1040-1300`

**Interfaces:**
- Consumes: Action control toolbar, `RichTextToolbar`, and table `<thead>`.
- Produces: Pinned sticky top header (`sticky top-0 z-40`).

- [ ] **Step 1: Wrap control panel & formatting bar in a sticky container**

Wrap header actions bar and `<RichTextToolbar />` in a fixed sticky header wrapper:
```tsx
<div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 pb-2 pt-2 shadow-xs transition-all space-y-2">
  {/* Action Buttons & Title */}
  ...
  {/* RichTextToolbar */}
  {!readOnly && <RichTextToolbar editor={activeEditor} />}
</div>
```

- [ ] **Step 2: Make table column headers sticky (`<thead>`)**

In `RunsheetTableEditor.tsx`:
```tsx
<thead className="sticky top-[105px] z-30 bg-slate-100 shadow-2xs">
```

- [ ] **Step 3: Run typecheck to verify layout compilation**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "feat: lock top control bar, formatting toolbar, and table headers to sticky top"
```

---

### Task 3: Excel-Style Inline Row Insertion ("Insert Row Above" & "Insert Row Below")

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx:640-660,940-970`
- Test: `tests/unit/components/EventTeamRosterCard.test.ts`

**Interfaces:**
- Consumes: `items` array state and `handleInsertRow(targetIndex, position)`.
- Produces: Ability to add blank rows above or below any row.

- [ ] **Step 1: Add handleInsertRow logic to RunsheetTableEditor.tsx**

```tsx
const handleInsertRow = (targetIndex: number, position: 'above' | 'below') => {
  if (readOnly) return;
  saveSnapshot();
  const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
  const newRow: RunsheetItemRow = {
    id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    title: '',
    duration: 5,
    order: insertIndex,
    attributeValues: {},
    isNew: true,
  };

  setItems((prev) => {
    const updated = [...prev];
    updated.splice(insertIndex, 0, newRow);
    return updated;
  });
  setEditingCell({ rowIndex: insertIndex, key: columns[0]?.key || 'title' });
  setIsDirty(true);
};
```

- [ ] **Step 2: Add inline Insert Above / Below buttons in Table and Card view rows**

In Table view row index cell and Card View action buttons:
Add dropdown/popover or split action buttons:
- `+ Above`
- `+ Below`

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "feat: add Excel-style Insert Row Above and Below functionality"
```

---

### Task 4: Runsheet Subtitle / Highlights Field

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx:1000-1030`

**Interfaces:**
- Consumes: `subtitle` state and Rock RMS payload.
- Produces: Subtitle input under Runsheet Title header.

- [ ] **Step 1: Add subtitle state and input in RunsheetTableEditor.tsx**

```tsx
const [subtitle, setSubtitle] = useState<string>('');

<div className="flex flex-col gap-0.5">
  <input
    type="text"
    value={subtitle}
    onChange={(e) => {
      setSubtitle(e.target.value);
      setIsDirty(true);
    }}
    placeholder="Add subtitle or highlights (e.g. Communion Sunday, Water Baptism)..."
    className="text-xs font-semibold text-slate-600 bg-transparent border-b border-dashed border-slate-300 focus:border-slate-800 focus:outline-none py-0.5 w-full sm:w-96"
  />
</div>
```

- [ ] **Step 2: Run typecheck and test build**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "feat: add runsheet subtitle and highlights field"
```
