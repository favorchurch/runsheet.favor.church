# Favor Runsheet Studio

A spreadsheet-style editor for Favor Church service runsheets, backed by Rock RMS.

A runsheet is a Rock **ContentChannel**; each segment is a **ContentChannelItem**.
The grid's columns are the channel's item attributes, so they are discovered at
runtime rather than hardcoded — a new attribute in Rock shows up as a new column.

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Required environment variables (`.env.local`):

| Variable | Purpose |
| --- | --- |
| `ROCK_API_URL` / `NEXT_PUBLIC_ROCK_API_URL` | Rock REST API base, e.g. `https://rock.favor.church/api` |
| `ROCK_API_KEY` | Rock API key. **Never commit this.** |
| `AUTH0_*` | Auth0 config — see `auth0.config.js` |
| `REDIS_URL` | Optional; the Rock object cache is skipped when unset |

```bash
pnpm build          # production build (lint + typecheck included)
pnpm typecheck      # tsc --noEmit on its own
pnpm test           # jest
pnpm list:channels  # print the Rock channel ids that hold runsheets
```

## Layout

```
src/
  app/                     Next.js App Router entry, root layout, global CSS
  components/runsheet/     The editor UI
    RunsheetManager        Channel picker and load/create flow
    RunsheetTableEditor    The grid: rows, merged time cells, drag reorder, save
    RichTextCell           Tiptap editor mounted on the cell being edited
    RichTextToolbar        One formatting bar, acting on the open cell
    RichTextContent        Read-only renderer for every other cell
    PeopleSearchDropdown   Picker for Rock Person-backed columns
  server-actions/          The only write boundary to Rock — see its README
  auth0-hooks/             Auth0 session plus Rock-backed authorization helpers
  lib/                     richText, sanitizeRichText, runsheetTime, logging
  constants/               client.ts (public), server.ts (secrets), runsheet config
  types/                   Shared shapes; Runsheet.ts covers the grid
  util-date/ util-rock/ util-connect/   Pure helpers
scripts/                   One-off operational scripts
tests/                     Jest setup and module mocks
public/                    Static assets served at /
```

## Cell formatting

Text cells are rich text. Click a cell to edit it and use the formatting bar
above the grid: bold, italic, underline, strikethrough, text and fill colour,
alignment, lists, and clear formatting. `Cmd/Ctrl+B`, `I` and `U` work as usual.
`Enter` saves the cell, `Shift+Enter` adds a line inside it, `Escape` closes it.

Values are stored as a small subset of HTML (`src/lib/richText.ts` defines the
allowlist). Cells written before this editor used `**bold**` / `~~italic~~`
markers, and those are converted on read, so old runsheets keep their formatting
without a migration. Rock's own `ContentChannelItem.Title` column is written as
plain text so Rock's admin screens stay readable; the formatted title lives in
the `ACTIVITYTITLE` attribute.

Person-backed columns (Rock field type 18, plus keys containing `PLATFORM`,
`ANCHOR` or `PREACHER`) stay a people picker rather than a rich-text cell — the
stored value has to remain a resolvable person name.

## Known gaps

- **The runsheet list is hardcoded.** `RunsheetManager` lists a fixed set of
  channel ids and calls `getRockContentChannelOptions()` without using the
  result. It should instead fetch the runsheet channels the signed-in user can
  actually see in Rock. `pnpm list:channels` is the stopgap for finding ids.
- **Section-scoped authorization is dormant.** `rockResolveAccess` only resolves
  `campusIds`, so the section helpers in `auth0-hooks/server/` always see empty
  lists. They are inherited from the Connect portal this app was split out of.
- **Saving is chatty.** `rockBulkSaveRunsheetItems` issues a handful of Rock
  requests per row, so saving a long runsheet takes a few seconds.
