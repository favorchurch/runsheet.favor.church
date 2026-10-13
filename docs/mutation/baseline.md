# Mutation testing baseline

- Run date: 2026-10-13
- Source commit: `987644b` (main)
- Tooling: StrykerJS 10.0.0 (`@stryker-mutator/core`, `jest-runner`, `typescript-checker`), concurrency 2, `perTest` coverage
- Config: `stryker.config.mjs`, sha256 `58c676f5e5f4b455ce999417e235b4874ecc03d1b82ee598daadfca228cceab4`
- Command: `pnpm test:mutation` (about 22 minutes on the 16 GiB Mac)
- Reports (gitignored): `reports/mutation/mutation.html`, `reports/mutation/mutation.json`

Score = (killed + timeout) / (killed + timeout + survived + no coverage). Compile errors are mutants the TypeScript checker rejected, so they are excluded from the score.

## Allowlist

`src/lib/` modules: runsheetDate, runsheetKind, runsheetCampus, runsheetPropagate, runsheetMatch, runsheetAccessPolicy, runsheetChannelAccess, growAccessPolicy, rosterAccess, rockRosterSlots, rockServiceSchedule, permissions, runsheetInlineDiff.

There is no `src/lib/runsheetDiff` module. `tests/unit/runsheetDiff.test.ts` defines its diff logic inline, so `runsheetInlineDiff.ts` takes its slot as the diff module. UI components are not mutated. Stryker's Jest run skips jsdom docblock suites (`/components/`, `userPreferences.test.ts`) because they bypass Stryker's coverage environment. It also skips `tests/integration/`. None of these suites exercise the allowlisted modules.

## Scores

| Module | Killed | Survived | No cov | Compile err | Score |
|---|---:|---:|---:|---:|---:|
| permissions | 36 | 0 | 0 | 19 | 100.0 |
| rockRosterSlots | 30 | 3 | 0 | 15 | 90.9 |
| runsheetChannelAccess | 34 | 2 | 2 | 34 | 89.5 |
| runsheetAccessPolicy | 62 | 9 | 0 | 32 | 87.3 |
| rosterAccess | 45 | 5 | 2 | 37 | 86.5 |
| runsheetCampus | 24 | 3 | 1 | 16 | 85.7 |
| growAccessPolicy | 11 | 1 | 1 | 7 | 84.6 |
| runsheetPropagate | 30 | 5 | 6 | 54 | 73.2 |
| rockServiceSchedule | 40 | 15 | 0 | 25 | 72.7 |
| runsheetMatch | 20 | 7 | 1 | 38 | 71.4 |
| runsheetDate | 142 | 64 | 7 | 61 | 66.7 |
| runsheetKind | 12 | 6 | 0 | 15 | 66.7 |
| runsheetInlineDiff | 109 | 85 | 32 | 97 | 48.2 |
| **Total** | **595** | **205** | **52** | **450** | **69.84** |

## Surviving-mutant clusters for T2

Ordered by weakest score first. Line numbers refer to `987644b`.

- **runsheetInlineDiff**: 85 survived and 32 uncovered. Candidate matching predicates at L225/L243 (`rowStatus === 'matched' && sourceIndex...`) survive operator flips. The insertion bound at L230 and the duration-skip loop at L75 survive boundary and logical mutants. The module has no direct unit test; add one.
- **runsheetDate**: 64 survived. The time-range guard at L73 (`hours >= 0 && hours < 24 && ...`) has 20 survivors, so add boundary tests (-1/0/23/24, minutes and seconds 59/60). Date-name regexes at L21 and L29 survive anchor and quantifier mutants. The `parts.length >= 3` branch at L117 is not pinned.
- **runsheetKind**: label map L12-L14 and `RUNSHEET_KIND_ORDER` L9 are never asserted by value.
- **runsheetMatch**: the title trim and fallback at L34, the uniqueness filter at L72, the siblingKey fallback at L30 and the `channelId: -1` sentinel at L79.
- **rockServiceSchedule**: the service-name regex at L58 (anchors, `+`, `\d{1,2}`, `\s*`) and `trim` at L58/L60. Normalisation at L31 and date padding at L36.
- **runsheetPropagate**: the status predicate at L33 (`unmatched || exists`), the target-value fallback at L139, existing-match lookup at L83 and `isNewRow` at L94. Six mutants have no coverage.
- **runsheetAccessPolicy**: group-name trim at L126, and the `$` anchors on the EVENTS_TEAM/DEAF_MINISTRY patterns at L13/L19. The cycle guard `seen.add` at L87 is never exercised.
- **rosterAccess**: the startDateTime regex at L62 and the seconds default `'00'` at L65.
- **Smaller**: runsheetCampus L30/L35/L36, runsheetChannelAccess empty-array fallbacks L24/L40/L46 and grow short-circuit L43, rockRosterSlots tie-break L36, growAccessPolicy role-name trim at L15.
