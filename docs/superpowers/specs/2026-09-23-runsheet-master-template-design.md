# Runsheet Master Template — Design

**Date:** 2026-09-23
**Status:** Approved (design), pending implementation plan

## Problem

Uncommitted work in the tree adds a "Runsheet Master Template": a Rock content
channel that new runsheets copy their rows from, editable via an "Edit Master
Template" button. As written it has these defects:

1. The template name carries no campus, so `assertRunsheetEditAccess` denies
   every campus-scoped editor. `rockCreateServiceRunsheet` swallows that denial
   and saves a runsheet with **zero rows** — a regression for most editors.
2. No fallback: any template failure produces an empty runsheet.
3. The template channel appears in the landing list (and as a propagation
   target candidate) for all-campus users.
4. Concurrent first use can create duplicate template channels.
5. Copied rows keep their `SIBLINGKEY`, silently linking every runsheet to the
   template's keys.
6. Uses `alert()` instead of the app's toasts; no tests.

## Decisions

- **One template per campus** (`MNL`, `BNE`, `SEL`), **isolated**: a campus
  editor sees and edits only their own campus's template. All-campus users
  (`runsheetCampuses: ['ALL']`) can reach every template.
- Any runsheet editor at a campus may edit that campus's template.
- `SIBLINGKEY` is **stripped** when rows are copied into a new runsheet.

## Approach

Keep the template as an ordinary runsheet content channel (type 13), one per
campus, named `<CODE> // Runsheet Master Template` (e.g.
`MNL // Runsheet Master Template`). Because the name carries a campus marker,
the existing `canAccessRunsheetChannel` / `assertRunsheetEditAccess` gates
enforce isolation with no new access rules, and the existing editor edits it.

Rejected: storing template rows as JSON on another Rock entity — needs a new
editor and new authorization for no gain.

## Design

### 1. Template naming — `src/lib/runsheetTemplate.ts` (new, pure)

- `masterTemplateName(campus: RunsheetCampusCode): string` →
  `` `${campus} // Runsheet Master Template` ``.
- `isMasterTemplateName(name: string): boolean` — true when the name ends with
  `// Runsheet Master Template` (case-insensitive, trimmed).
- `buildDefaultTemplateItems(): RunsheetItemRow[]` — the hardcoded
  `DEFAULT_RUNSHEET_TEMPLATE` rows as new items (shared by sections 2 and 3).

Pure module so both server actions and client components can import it.

### 2. `rockEnsureRunsheetTemplate(campus)` — server action

- Signature: `(campus: RunsheetCampusCode) => Promise<{ success; id?; error? }>`.
- Validates `campus` is in `RUNSHEET_CAMPUS_CODES`; otherwise fails.
- Runs `assertRunsheetEditAccess(session, masterTemplateName(campus))` — campus
  isolation comes for free.
- Looks up channels of type 13 with that exact `Name`, `$orderby: 'Id asc'`,
  `$top: 1`. Existing → return its id (oldest wins if duplicates ever exist;
  no locking — the race is rare and harmless under this rule).
- Missing → create the channel and seed it with `buildDefaultTemplateItems()`.

### 3. `rockCreateServiceRunsheet` — populating a new runsheet

- Derive the campus with `extractRunsheetCampus(title)`.
- If a campus is found: ensure its template, load it with
  `rockGetRunsheetDetails`, copy rows as new items (`id: new_…`, `isNew: true`,
  `changedKeys: undefined`, `order: idx + 1`) and set
  `attributeValues.SIBLINGKEY` to `''`.
- **Fallback** to `buildDefaultTemplateItems()` (the pre-change behavior) when:
  no campus is found, ensure fails, load fails, or the template has zero rows.
  A new runsheet is never left empty.

### 4. Hide templates from runsheet lists

- `rockGetAvailableRunsheetChannels` filters out `isMasterTemplateName(c.Name)`.
  This removes templates from the landing list and from `resolveSiblings`
  input, so they can never be a propagation target.

### 5. UI

- **Landing button** (`RunsheetLandingView` / `RunsheetManager`):
  - Editor scoped to exactly one campus → button opens that campus's template
    directly.
  - All-campus user (or multi-campus scope) → button opens a small menu of the
    campuses in scope (MNL / BNE / SEL); picking one opens that template.
  - Errors use `toast.error`, not `alert()`.
  - The user's campus scope must reach the client; if it isn't already passed
    down, pass `runsheetCampuses` from the session alongside `canEdit`.
- **Editor**: when `isMasterTemplateName(channelName)`, show a
  "Master Template" badge and hide the start-time / date controls (not
  meaningful for a template). Propagation cannot trigger: `resolveSiblings`
  already returns `[]` for names without a date.

### 6. Error handling

- All server-action failures return `{ success: false, error }` with
  user-safe messages (no Rock ids or upstream bodies), matching existing
  actions.
- Runsheet creation never fails because of the template — it falls back.

### 7. Testing

- `runsheetTemplate` unit tests: `masterTemplateName`, `isMasterTemplateName`
  (positive, negative, case/whitespace).
- `rockEnsureRunsheetTemplate` (mocked `rockGet`/`rockPost`): returns existing
  id; creates and seeds when missing; queries oldest-first; denies an editor
  from another campus; rejects an invalid campus code.
- `rockCreateServiceRunsheet`: copies template rows with `SIBLINGKEY` blanked;
  falls back to defaults on ensure failure, load failure, empty template, and
  campus-less title.
- `rockGetAvailableRunsheetChannels`: excludes template channels.
- Landing view: single-campus editor gets a direct button; all-campus user
  gets the campus menu.
- `pnpm typecheck` and `pnpm test` both pass.

## Delivery

- Separate commit from the Favor News propagation fix.
- Commit order: Favor News fix as **1.14.1**, then this feature as **1.15.0**
  (semver minor — new feature).

## Out of scope

- Migrating or deleting any global `Runsheet Master Template` channel already
  created by the uncommitted code. If one exists in Rock it is hidden from
  campus-scoped users and ignored by the app; remove it manually.
- Per-service (time-of-day) templates.
