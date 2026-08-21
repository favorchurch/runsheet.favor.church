# Wayfinder Map: Song Detail & Selection Modal Redesign

`label: wayfinder:map`

## Destination

Deliver a modern, brand-aligned **Song Detail & Selection Modal** in the Favor Church Runsheet Editor that displays rich, structured song data (Artist, Key, BPM/Time Signature, CCLI, Sheet Music/Chord Charts, Lyrics & Arrangement Flow, and direct Rock RMS links) with an integrated search & key selector, replacing the cramped popover dropdown and new-tab HTML view.

## Notes

- **Domain:** Favor Church Runsheet (`runsheet.favor.church`), Rock RMS Content Channel 18 (`Songs`).
- **Brand & Visual Guidelines:** Tailwind CSS, Slate color palette (`bg-slate-900`, `text-slate-950`, `border-slate-200`), backdrop blur modal overlays, crisp pill badges, Heroicons v2 icons.
- **Constraints:**
  - Read-only song metadata presentation directly from Rock RMS.
  - Redirect to Rock RMS (`https://rock.favor.church/ContentChannelItem/{id}`) for editing songs in library.
  - Interactive selection updates the runsheet row's activity title and song item ID.
- **Relevant Skills & References:**
  - `ui-ux-pro-max` for layout, responsive tabs, typography, and contrast.
  - `src/server-actions/rockSearchSongs.ts` & `src/app/api/song/route.ts` for Rock ContentChannelItem parsing.

## Decisions so far

<!-- the index: one line per closed ticket -->
*(None yet - charting phase)*

## Frontier Tickets (Open & Unblocked)

### Ticket 1: [Define Structured Song Details Fetch Action and Type Model](file:///Users/rico/Git/runsheet.favor.church/docs/wayfinder-song-detail-modal-map.md#ticket-1)
- **Type:** `wayfinder:task`
- **Assignee:** Unassigned
- **Status:** Unblocked (Frontier)
- **Question:** How should the server action (`rockGetSongDetails`) structure and parse song metadata (BPM, Key, Artist, CCLI, chord chart attachment links, lyrics sections, and themes) from Rock RMS ContentChannel 18 into a typed JSON contract for client components?

### Ticket 2: [Design Song Detail & Selection Modal Layout & UX](file:///Users/rico/Git/runsheet.favor.church/docs/wayfinder-song-detail-modal-map.md#ticket-2)
- **Type:** `wayfinder:prototype`
- **Assignee:** Unassigned
- **Status:** Blocked by Ticket 1
- **Question:** How should the dual-pane modal (left: song search & result selector; right: rich metadata badges, chord charts download links, lyrics/flow tabs, key selector footer, and 'Open in Rock RMS' button) be laid out across desktop and mobile breakpoints to match the Favor Church design system?

### Ticket 3: [Integrate Modal Trigger into Runsheet Table and Card Editors](file:///Users/rico/Git/runsheet.favor.church/docs/wayfinder-song-detail-modal-map.md#ticket-3)
- **Type:** `wayfinder:task`
- **Assignee:** Unassigned
- **Status:** Blocked by Ticket 2
- **Question:** How should `RunsheetTableEditor.tsx` wire modal triggers for music cells (replacing both `SongSearchDropdown` and the `/api/song` new-tab link) across Table View, Card View, and read-only preview mode while ensuring keyboard navigation (Escape, Enter) and focus trapping?

## Not yet specified

- Song arrangement versions support (if multiple arrangements/keys exist per song in Rock RMS).
- Caching strategy for song search & details in client state / SWR.

## Out of scope

- Direct in-runsheet editing/mutating of Rock RMS Song library items (ruled out: editing is done via external redirect to Rock RMS).
- CCLI automated reporting or licensing sync.
