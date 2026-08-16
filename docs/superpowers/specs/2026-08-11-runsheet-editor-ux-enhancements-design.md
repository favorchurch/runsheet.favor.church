# Runsheet Editor UX Enhancements Design Specification

## Overview
This specification details four key user experience and editing enhancements for the Favor Church Runsheet Editor:
1. **Sticky Locked Top Toolbar & Formatting Bar:** Pinned control header and formatting toolbar that follow page scrolling.
2. **Excel-style Inline Row Insertion:** Ability to insert blank rows above or below any existing row, plus quick hover row actions.
3. **Runsheet Subtitle & Highlights Field:** Subtitle input directly below the main runsheet title (e.g. *"Communion Sunday"*), persisted to Rock RMS metadata.
4. **Fix Mouse Pointer Text Cursor Placement:** Stop event bubbling and redundant state re-renders when clicking inside active rich text cells so mouse selection works naturally.

---

## 1. Sticky Locked Top Toolbar & Formatting Bar

### Goal
Ensure function buttons (Save, Add Row, Reset, Export, View Mode) and the TipTap Rich Text Toolbar remain visible at the top of the browser window as users scroll through long runsheets.

### Design Details
- Wrap the main header control bar and `<RichTextToolbar />` in a sticky container:
  `className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs transition-all"`
- Table column headers (`<thead>`) will also be sticky (`sticky top-[offset] z-30`) so column labels remain aligned during vertical scrolling.

---

## 2. Excel-Style Inline Row Insertion

### Goal
Allow users to insert new schedule rows anywhere in the runsheet without scrolling to the top or bottom of the table.

### Design Details
- **Row Action Buttons:**
  - On each table row (`<tr>` in Table View) and card (`Card View`), provide an inline action menu / split buttons:
    - `+ Insert Row Above`
    - `+ Insert Row Below`
    - `Delete Row`
  - In Table View: Add a left action column or hover action button on row indices (`#`).
- **Data Model Logic:**
  - `handleInsertRow(targetIndex: number, position: 'above' | 'below')`:
    Creates a new blank `RunsheetItemRow` and inserts it into `items` array at `targetIndex` or `targetIndex + 1`.
    Calculates appropriate order indices and triggers `setIsDirty(true)`.

---

## 3. Runsheet Subtitle / Highlights Field

### Goal
Provide a clear subtitle input directly beneath the Runsheet Title for event highlights (e.g., *"Communion Sunday"*, *"Water Baptism & Guest Speaker"*).

### Design Details
- Add a new input field under the main Runsheet Title header:
  - Label: *"Runsheet Subtitle / Highlights"*
  - Placeholder: *"e.g. Communion Sunday, Water Baptism"*
- **Persistence:**
  - Persisted in Rock RMS under the channel item's Summary or attribute metadata.
  - Rendered in both Table View header and Card View header.

---

## 4. Mouse Pointer Text Cursor Placement Fix

### Goal
Allow users to click anywhere within a text sentence or paragraph using the mouse cursor without losing focus or snapping to the end of the cell.

### Root Cause
Clicking inside an open `<RichTextCell>` bubbles up to the parent `<td>`'s `onClick` handler, calling `setEditingCell({ rowIndex, key })` again. This React state update re-renders the component and re-evaluates `autofocus: 'end'`, resetting the mouse cursor back to the end of the text.

### Design Fix
1. In `RichTextCell.tsx`: Add `onMouseDown={(e) => e.stopPropagation()}` and `onClick={(e) => e.stopPropagation()}` to the container element.
2. In `RunsheetTableEditor.tsx`: Guard `handleCellClick(rowIndex, key)` to return early if the target cell is already `editingCell`.

---

## Verification Plan

### Automated Tests
- `pnpm typecheck` to verify no compilation errors.
- `pnpm test` to verify all unit tests pass.

### Manual Verification
- Scroll down a long runsheet to confirm top toolbar stays sticky.
- Insert a row above and below middle schedule items and verify order calculation.
- Add a subtitle highlight and verify persistence.
- Click inside middle of words/sentences in TipTap rich text cells and verify text cursor positioning.
