# Wayfinder Map: Runsheet Enhancements

`label: wayfinder:map`
`github_issue: #51`

## Destination

Implement 5 key enhancements to the Favor Church Runsheet application:
1. **Compare Start Time**: Include service start time and calculated segment start times in `RunsheetCompareView`.
2. **Cell URL / File Reference**: Allow adding a URL/file reference to any cell during edit mode, rendered as a dedicated footer chip in view mode that opens the URL in a new tab.
3. **Cell Edit Enter as Newline**: Update cell editing so pressing "Enter" inserts a newline instead of committing/closing the cell.
4. **Move View / Edit Buttons**: Relocate the View / Edit mode buttons to the top right of the sticky event card header instead of the runsheet selection card.
5. **Move Event Team Roster Pane**: Position the "Event Team Roster" pane below the runsheet selector and above the runsheet title.

## Notes

- **Domain:** Favor Church Runsheet (`runsheet.favor.church`), Rock RMS Content Channels & Attributes.
- **Brand & Visual Guidelines:** Tailwind CSS, Slate color palette (`bg-slate-900`, `text-slate-950`, `border-slate-200`), Heroicons v2 icons.
- **Constraints:**
  - Full automated test coverage (preserve and expand test suite).
  - Proper HTML sanitization for URLs and rich text (`sanitizeRichText.ts`, DOMPurify).
  - Optimistic client updates and Rock RMS synchronization.

## Decisions so far

*(None yet - charting phase)*

## Frontier Tickets (Open & Unblocked)

- [#52: Include Start Time in Runsheet Compare View](https://github.com/favorchurch/runsheet.favor.church/issues/52) (`wayfinder:task`)
- [#53: Add URL / File Reference Support in Runsheet Cells](https://github.com/favorchurch/runsheet.favor.church/issues/53) (`wayfinder:prototype`)
- [#54: Configure Cell Editing Enter Key to Insert Newline](https://github.com/favorchurch/runsheet.favor.church/issues/54) (`wayfinder:task`)
- [#55: Move View and Edit Mode Buttons to Sticky Event Card Top Right](https://github.com/favorchurch/runsheet.favor.church/issues/55) (`wayfinder:task`)
- [#56: Reposition Event Team Roster Pane Below Runsheet Selector and Above Runsheet Title](https://github.com/favorchurch/runsheet.favor.church/issues/56) (`wayfinder:task`)

## Not yet specified

- Optional custom label for attached cell URLs (defaults to full URL / domain).
- Cell URL attachment support in Card View inline editors.

## Out of scope

- Direct file upload / cloud storage hosting (URLs only, e.g., Google Drive, Dropbox, external links).
- Persisting cell URLs to a separate custom Rock RMS entity (persisted within the cell's rich-text attribute value).
