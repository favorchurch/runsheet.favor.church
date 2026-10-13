Use semver to update versions

## Testing

This is the one canonical testing section for agents. Details (tiers, Jest env switches, mutation reports) live in [docs/testing.md](docs/testing.md).

- **Setup:** package root is the repo root (`package.json`, `pnpm-lock.yaml`). Node >=24 and pnpm 10 (`packageManager: pnpm@10.33.0`). Run `pnpm install --frozen-lockfile`. No Python or Deno toolchain applies here.
- **What matters:** unit tests for `src/lib/` business rules (access policy, runsheet date/match/propagate/diff, roster and schedule) and server actions, plus `tests/integration/` write paths. UI tests stay smoke-level.
- **Boundaries:** tests run only against mocked Rock and Auth0 boundaries. No test reads or writes production Rock, a database, or needs a privileged secret. Keep the `secret-scan.yml` gitleaks guard (blocked by Actions policy today, see CI) and the access-policy tests intact.
- **Commands:** `pnpm typecheck`, `pnpm exec next lint` (read-only lint), `pnpm test:unit` (cheap), `pnpm test` (full gate), `pnpm build` (before ready). `pnpm lint` runs `next lint --fix` and rewrites files, so it is not read-only.
- **Tier 1, changeset checks:** `pnpm test:changed` or `pnpm test:unit`, plus `pnpm typecheck`.
- **Tier 2, final-ready PR proof:** `pnpm typecheck && pnpm exec next lint && pnpm test && pnpm build`.
- **Tier 3, post-merge or deep runs:** `pnpm test:mutation` (StrykerJS, 20 to 50 minutes on a 16 GiB Mac). It is targeted and deep, never per-commit. Run it when a change touches an allowlisted business-rule module in `stryker.config.mjs`, or as pre-merge deep proof. Property and mutation tests are not routine checks. Technique approved in [runsheet#91](https://github.com/favorchurch/runsheet.favor.church/issues/91) and [rock-steward#156](https://github.com/favorchurch/rock-steward/issues/156).
- **Tier 4, real data or credentials:** none exist. Every Rock and Auth0 boundary is mocked.
- **CI:** the only GitHub workflow is `.github/workflows/secret-scan.yml`, so there is no CI test gate today. Vercel builds on every push. Actions permissions are `allowed_actions: local_only` (checked with `gh api repos/favorchurch/runsheet.favor.church/actions/permissions`), which allows only actions defined in repositories owned by this org or enterprise. `secret-scan.yml` uses the external `actions/checkout@v4`, so it cannot run today: every run ends in `startup_failure` (`gh run list --workflow secret-scan.yml`). Fixing that belongs to rock-steward#157.
- **Receipts:** if a PR has a GitHub Actions test run, inspect that run. Otherwise quote the local command output with its exit code in the PR or issue.
- **Ownership:** [rock-steward#157](https://github.com/favorchurch/rock-steward/issues/157) owns CI cadence, caching, runner and action permissions, required-check semantics and rollout. Do not add a second testing section here or in CLAUDE.md.
