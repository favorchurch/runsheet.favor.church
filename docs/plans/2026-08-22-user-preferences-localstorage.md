# Persist runsheet user preferences in localStorage

**Date:** 2026-08-22 · **Gear:** express · **Repo:** runsheet.favor.church
**Tracking issue:** https://github.com/favorchurch/runsheet.favor.church/issues/47

## Context

Users want their runsheet UI preferences saved across sessions using browser `localStorage`:
1. View mode (`'grid'` vs `'cards'`) — defaults to `'grid'` when no stored preference exists.
2. Event Team Roster collapsed state (`isCollapsed` / Show vs Hide Roster) — defaults to `true` (roster hidden) when no stored preference exists.

## Global Constraints

- SSR & Hydration Safety: Next.js renders on the server where `window` and `localStorage` are undefined. Storage reads must happen client-side without causing hydration mismatch warnings.
- Robust error handling: Wrap all `localStorage` access in try/catch to safely handle disabled cookies, private browsing modes, or quota errors.
- Versioning: Follow semver (`AGENTS.md`) by bumping version from `1.10.3` to `1.11.0`.
- Validation command: `pnpm test` and `pnpm lint`.

### Blast Radius Ceiling

- Workspace: `/Users/rico/Git/runsheet.favor.church` only.
- Restricted: No production deploy, no remote Rock RMS mutations, no Auth0 modifications.

### Pinned Interface Signatures

1. `src/components/runsheet/RunsheetTableEditor.tsx:215`:
```typescript
const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'grid'>('grid');
```

2. `src/components/runsheet/EventTeamRosterCard.tsx:116`:
```typescript
const [isCollapsed, setIsCollapsed] = useState(false);
```

## Tasks

### T1 — User preferences utility module
- **File:** `src/lib/userPreferences.ts` & `src/lib/userPreferences.test.ts`
- **Strategy:** PRO (`gemini-3.7-flash-high`)
- **Touches:** `src/lib/userPreferences.ts`, `src/lib/userPreferences.test.ts`
- **Behavior:**
  - `getViewModePreference()` returns `'grid' | 'cards'`, defaulting to `'grid'`.
  - `setViewModePreference(mode: 'grid' | 'cards')` persists to `runsheet_pref_view_mode`.
  - `getRosterCollapsedPreference()` returns `boolean`, defaulting to `true` (roster hidden).
  - `setRosterCollapsedPreference(collapsed: boolean)` persists to `runsheet_pref_roster_collapsed`.
  - Safe error handling for missing window/localStorage/storage disabled.

### T2 — Wire preferences in `RunsheetTableEditor` and `EventTeamRosterCard`
- **File:** `src/components/runsheet/RunsheetTableEditor.tsx`, `src/components/runsheet/EventTeamRosterCard.tsx`
- **Strategy:** PRO (`gemini-3.7-flash-high`)
- **Touches:** `src/components/runsheet/RunsheetTableEditor.tsx`, `src/components/runsheet/EventTeamRosterCard.tsx`
- **Behavior:**
  - In `RunsheetTableEditor`, load saved `mobileViewMode` on client mount and persist on toggle.
  - In `EventTeamRosterCard`, default `isCollapsed` to `true`, load saved preference on client mount, and persist on toggle.

### T3 — Version bump and tests
- **File:** `package.json`, `tests/unit/components/RunsheetTableEditor.layout.test.tsx`
- **Strategy:** FLASH (`gemini-3.7-flash-high`)
- **Touches:** `package.json`, `tests/unit/components/RunsheetTableEditor.layout.test.tsx`
- **Behavior:**
  - Bump version to `1.11.0` in `package.json`.
  - Update and add layout/preference unit tests.

## Dependency Graph & Waves

```
Wave 1: T1 (userPreferences utility + tests)
Wave 2: T2 (RunsheetTableEditor + EventTeamRosterCard integration)
Wave 3: T3 (package.json version bump + layout tests verification)
```

## Out of Scope

- Remote server persistence of preferences (preferences are local to the client browser).
- Changing default column layout or table styling.
