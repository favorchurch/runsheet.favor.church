# Event Team Roster & UI Palette Refinement Specification

## Overview
This specification details the addition of a persistent **Event Team Roster** section at the very top of the Favor Church Runsheet Editor (visible in both Table and Cards view modes), alongside a complete UI theme refinement replacing purple/violet colors with modern Indigo/Slate accents.

---

## 1. Roster Data Model & Isolation
### Vital Roles (8 Manual Person Pickers)
The 8 vital event roles are:
1. **Service Director**
2. **Service Producer**
3. **Stage Manager Captain**
4. **Music Director**
5. **Offstage Director**
6. **Worship Leaders**
7. **Host Core Cap**
8. **Security Lead**

- **Persistence:** Stored in Rock RMS as `ContentChannelItem` records with titles formatted as `Roster: <Role Name>`.
- **Ordering:** Internal order indices are set to `-100` to `-93`.
- **Template & New Runsheet Inclusion:** Roster items are automatically populated when a new runsheet is created or when `applyDefaultTemplate()` is invoked during a form reset.
- **Schedule Isolation:** `processedRows` explicitly filters out all items starting with `Roster:`, so roster items do not impact schedule time calculations or clutter regular runsheet tables.

---

## 2. Platform Roles Auto-Extraction
The 5 Platform roles are computed live from active schedule items:
1. **Huddle Hype:** Contacts attached to person columns in the row matching `All-In Huddle`.
2. **MC 1:** Contacts attached to person columns in the row matching `MC1` or `MC 1`.
3. **MC 2:** Contacts attached to person columns in the row matching `MC2` or `MC 2`.
4. **Preacher:** Contacts attached to person columns in the row matching `Sermon` or `Preacher`.
5. **Wrap/Up Announcements:** Description/detail text copied from the row matching `Wrap-up & Announcements`.

---

## 3. UI Architecture & Color Palette Refinement
- **Placement:** Positioned as a full-width non-collapsible card at the top of the Runsheet Editor (above both Table and Cards views).
- **Interaction:** Clicking any vital role cell opens the standard `PeopleSearchDropdown` to search and assign contacts.
- **Theme Color Change:** Replaces all existing `violet-*` and purple gradient classes across `RunsheetTableEditor.tsx`, `SongSearchDropdown.tsx`, `RichTextToolbar.tsx`, and `/api/song/route.ts` with clean Indigo (`indigo-*`), Slate (`slate-*`), and Pink (`pink-*`) tones.

---

## 4. Bulk Save & Persistence Pipeline
- **`rockBulkSaveRunsheetItems`:** `handleSave` combines schedule items (`processedRows`) and roster metadata items (`items.filter(item => item.title?.startsWith('Roster:'))`) into `preparedItems` to save changes concurrently to Rock RMS.
- **Template Preservation:** `applyDefaultTemplate()` and new runsheet creation preserve and write out roster items.
- **Undo / Redo:** State snapshots include roster metadata state.
