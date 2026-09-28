# Runsheet PDF Attachments (Preacher Notes) — Design

Date: 2026-09-28

## Problem

Preachers' notes arrive as PDFs and live outside the runsheet — in chat threads,
email, or a shared drive. The runsheet already holds everything else about a
segment, so the notes should hang off the segment itself, uploaded and read from
the runsheet with no second system.

## Scope

Attach one or more PDFs to a runsheet row (a Rock `ContentChannelItem`), store
them in Rock, view them in-app, and download them. Editors only.

Not in scope: attaching to a person or to a runsheet as a whole, non-PDF file
types, versioning, and orphaned-file cleanup automation.

## Data model

A channel opts into attachments by having a single item attribute with key
`PREACHERNOTES`, field type Text, on its `ContentChannelItem`s. Rock admins add
it per channel; no app change is needed to enable a channel, matching how every
other column in this app is discovered at runtime.

The attribute value is a JSON array:

```json
[{"guid":"…","name":"Nov 2 notes.pdf","size":184320,"uploadedAt":"2026-09-28T02:11:00Z"}]
```

- Absent, empty, or unparseable values are all read as "no attachments". A
  hand-edited Rock value can never break the grid.
- `name` and `size` are denormalised so the grid renders the list without a
  per-file Rock round-trip. A rename inside Rock does not propagate; that is an
  accepted trade.

Files are Rock `BinaryFile` records under a new BinaryFileType named
**Runsheet Attachment**, created with `RequiresViewSecurity = true` so Rock's
`GetFile.ashx` will not serve them to an anonymous URL holder. Rock has no
`ContentChannelItemAttachment` entity (verified against the live API), so an
attribute-held guid list is the only link available.

## Access

One rule, enforced server-side on every request: the caller must pass
`canEditRunsheetChannel` for the channel that owns the item. Upload, read, and
delete share it.

Viewers — rostered volunteers, Grow viewers — see no paperclip and receive 403
if they guess a URL. Client-side hiding is cosmetic; the server decides.

## Server surface

Route handlers under `src/app/api/runsheet-attachments/`:

- `POST /upload` — multipart. Asserts channel edit access; rejects the file
  unless its declared content type is `application/pdf` and its first bytes are
  `%PDF-`; posts to Rock `/api/BinaryFiles/Upload` under the Runsheet Attachment
  type; returns `{guid, name, size}`.
- `GET /[guid]` — asserts access, streams the file from Rock with
  `Content-Disposition: inline` so it can render in an embedded viewer, and with
  a `?download=1` variant that sends `attachment` instead.
- `DELETE /[guid]` — asserts access, deletes the BinaryFile in Rock.

Server action in `src/server-actions/`:

- `rockSetRunsheetItemAttachments(itemId, entries)` — authenticates, authorizes
  the item's channel, Zod-validates the array, writes the attribute via
  `rockPatch`. Follows the rules in `src/server-actions/README.md`.

### Save timing

Each file is persisted the moment its upload finishes: the route returns the
guid, and the client immediately calls `rockSetRunsheetItemAttachments` with the
updated array. There is no deferred or batched save and no dependence on the
grid's own save button — closing the tab right after an upload loses nothing.
Deletes persist the same way.

Upload and attribute write stay separate calls. If the attribute write fails,
the result is an orphaned BinaryFile in Rock rather than a half-written
attribute, and the panel surfaces the failure so the user can retry. Orphans are
harmless; a cleanup script can come later if they accumulate.

## UI

New component `src/components/runsheet/RunsheetAttachmentsCell.tsx`. The
3,200-line `RunsheetTableEditor` gets a render hook only — none of the logic.

- **Collapsed row:** a paperclip with a count badge when files exist, plain when
  empty. Editors only.
- **Toggle:** clicking the paperclip expands an inline panel for that row.
- **Panel:** the file list (name, size), a drop zone / file input with `accept=".pdf"`
  and `multiple`, and per-file delete with a confirm step.
- **Viewer:** clicking a file name opens a modal that renders the PDF inline
  from `GET /[guid]` in an `<iframe>`, with a **Download** button in the modal
  header hitting the same route with `?download=1`. Browsers that cannot render
  the PDF inline fall back to a download prompt with a visible message.
- **Upload feedback:** files upload one at a time with a per-file progress row.
  Each success appends to the list and saves immediately.

No app-side cap on file size or file count. Rock/IIS enforces a request-body
ceiling; that ceiling must be measured before ship, and an upload that exceeds it
must report the failure in the panel rather than fail silently.

## Testing

- `src/lib/runsheetAttachments.ts` parse/serialise helper: malformed JSON, empty
  string, absent attribute, round-trip, and entry-shape validation.
- PDF sniffing: a non-PDF with a `application/pdf` content type is rejected.
- Access: a viewer-role user is rejected on upload, read, and delete, following
  the existing `*.access.test.ts` pattern.

No E2E tests; this repo has none.

## Prerequisite

The **Runsheet Attachment** BinaryFileType must be created in Rock before any of
this works. It is created once, by hand or by script, not by the app at runtime.
The `PREACHERNOTES` attribute is then added to each channel that should have
attachments.
