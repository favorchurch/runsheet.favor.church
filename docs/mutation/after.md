# Mutation testing after pruning and strengthening

- Run date: 2026-10-13
- Source: branch `office/06dafe85/T4` at `d9ced5a` (T1 + T2 + T3 tests). The only source change from this commit to the T4 head is the `stryker.config.mjs` ignore below.
- Tooling: StrykerJS 10.0.0, concurrency 2, `perTest` coverage
- Config: `stryker.config.mjs`, sha256 `6957fe5a2f19879919e487bb3a89bb3a9d1803b0729948b541425d67093f86eb`
- Command: `pnpm test:mutation`

Score = (killed + timeout) / (killed + timeout + survived + no coverage), the same formula as [baseline.md](baseline.md).

## Config change and baseline rerun

T1's config (sha `58c676f5…`) fails its initial test run on this branch with "Missing coverage results for `tests/unit/pages/pageAuthGates.test.tsx`". Commit 122aa0f gave that suite a `@jest-environment jsdom` docblock, and docblock jsdom suites bypass Stryker's coverage environment. The amended config adds `<rootDir>/tests/unit/pages/pageAuthGates.test.tsx` to `jest.config.testPathIgnorePatterns`. The `mutate` allowlist and the runner settings are unchanged. That suite tests page auth gates and does not import any mutated module.

So that both sides use an identical config, the baseline was rerun under the amended config. That run used `src/` and `tests/` from `987644b` with this branch's tooling (`987644b` has no Stryker dependencies). It scored 69.94%, against 69.84% under the original config. The rerun generated 1305 mutants against 1302, and the 3 extra are all detected (timeouts in runsheetCampus and runsheetChannelAccess). The survived and no-coverage counts are unchanged.

## Scores

Columns are detected (killed + timeout) / survived / no coverage.

| Module | Before | Before % | After | After % | Delta |
|---|---|---:|---|---:|---:|
| runsheetInlineDiff | 109/85/32 | 48.2 | 192/28/6 | 85.0 | +36.7 |
| runsheetDate | 142/64/7 | 66.7 | 201/12/0 | 94.4 | +27.7 |
| runsheetKind | 12/6/0 | 66.7 | 18/0/0 | 100.0 | +33.3 |
| runsheetMatch | 20/7/1 | 71.4 | 27/1/0 | 96.4 | +25.0 |
| rockServiceSchedule | 40/15/0 | 72.7 | 47/8/0 | 85.5 | +12.7 |
| runsheetPropagate | 30/5/6 | 73.2 | 41/0/0 | 100.0 | +26.8 |
| growAccessPolicy | 11/1/1 | 84.6 | 12/1/0 | 92.3 | +7.7 |
| runsheetCampus | 25/3/1 | 86.2 | 24/4/0 | 85.7 | -0.5 |
| rosterAccess | 45/5/2 | 86.5 | 51/1/0 | 98.1 | +11.5 |
| runsheetAccessPolicy | 62/9/0 | 87.3 | 70/1/0 | 98.6 | +11.3 |
| runsheetChannelAccess | 36/2/2 | 90.0 | 34/3/0 | 91.9 | +1.9 |
| rockRosterSlots | 30/3/0 | 90.9 | 30/3/0 | 90.9 | +0.0 |
| permissions | 36/0/0 | 100.0 | 36/0/0 | 100.0 | +0.0 |
| **Total** | **598/205/52** | **69.94** | **783/62/6** | **92.01** | **+22.07** |

## The one drop: runsheetCampus

No test was lost. The change comes from two mutants that are classified differently:

- `runsheetCampus.ts:64` (ConditionalExpression `true`) was a timeout before, which counts as detected. After the change it is a Stryker `RuntimeError`, which the formula excludes. The mutant still fails the run, so it is detected in both runs.
- `runsheetCampus.ts:60` (ArrayDeclaration) had no coverage before. Now a test covers it but does not kill it.

If runtime errors count as detected, runsheetCampus scores 25/29 = 86.2 in both runs. Three runsheetChannelAccess timeouts at L54/L57 became runtime errors in the same way. They are excluded from the after score above, so the +1.9 for that module understates its gain.

## Remaining survivors

- runsheetInlineDiff: 28 survived and 6 uncovered, the largest remaining gap.
- runsheetDate: 12 survived.
- rockServiceSchedule: 8 survived, in the service-name regex at L58.
- runsheetCampus: 4 survived (L30/L35/L36/L60).
- runsheetChannelAccess: 3 survived (L40/L43/L46).
- rockRosterSlots: 3 survived, unchanged from the baseline.
