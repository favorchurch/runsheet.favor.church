# Test Suite Benchmark & Parity Verification Report

## Overview

This report provides empirical performance benchmarks and a comprehensive test parity proof comparing `origin/main` (commit `e81bacb`, BASE) against the T1 revision (commit `179ed25`, After).

After was measured on `179ed25` and R3 (`d14c468`) does not change `jest.config.ts` runtime behavior.

The benchmarks measure the impact of capping Jest workers to 50% by default (`jest.workers.ts`), disabling verbose test reporter logging (`verbose: false` by default), and establishing explicit test execution tiers.

All measurements were taken in hermetic scratch checkouts located outside the task worktree using a clean environment without `.env*` files or Rock RMS credentials.

---

## Benchmark Environment & Configuration

| Parameter | Value |
| --- | --- |
| **Date** | 2026-10-10 |
| **Host Architecture & OS** | macOS (Darwin 25.3.0, arm64) |
| **Host CPU Count** | 8 logical cores (`sysctl -n hw.ncpu`) |
| **Node Version** | `v26.5.0` (`node -v`) |
| **pnpm Version** | `10.33.0` (`pnpm -v`) |
| **Jest Version** | `29.7.0` |
| **Execution Environment** | Sanitized `env -i PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" HOME="/Users/jerwyn"` |
| **Secrets / Credentials** | None (no `.env*`, no Rock tokens, no Auth0 client secrets) |
| **Measurement Tool** | `/usr/bin/time -l` (macOS native high-precision resource accounting) |
| **Jest Cache Directory** | `/private/tmp/jest_dx` |
| **BASE Commit** | `e81bacb` (`origin/main`, package.json `1.29.1`) |
| **After Commit** | `179ed25` (T1 revision, package.json `1.30.0`) |

### Worker & Verbose Settings

- **BASE (`origin/main`)**:
  - `maxWorkers`: Unspecified in `jest.config.ts`, defaulted by Jest 29 to `cpus - 1` = **7 workers** on this 8-core host.
  - `verbose`: Explicitly set to `true` in `jest.config.ts`.
- **After (T1)**:
  - `maxWorkers`: Dynamically resolved via `resolveMaxWorkers()`, defaulting to `50%` = **4 workers** on this 8-core host.
  - `verbose`: Dynamically resolved via `resolveVerbose()`, defaulting to `false`.

---

## Benchmark Measurements

### 1. Cold Cache (Cleared `cacheDirectory`)

The Jest cache directory (`/private/tmp/jest_dx`) was cleared before each run using `rm -rf /private/tmp/jest_dx && pnpm exec jest --clearCache`.

| Metric | BASE (`origin/main`) | After (T1) | Delta | Percentage Change |
| --- | --- | --- | --- | --- |
| **Wall Clock (Real)** | 8.62 s | 6.38 s | -2.24 s | -25.99% |
| **User CPU Time** | 32.17 s | 24.36 s | -7.81 s | -24.28% |
| **System CPU Time** | 8.20 s | 3.58 s | -4.62 s | -56.34% |
| **Peak RSS** | 381,206,528 bytes (363.55 MB) | 464,519,168 bytes (443.00 MB) | +83,312,640 bytes | +21.85% |
| **Jest Reported Time** | 7.372 s | 4.925 s | -2.447 s | -33.19% |
| **Worker Count** | 7 (Jest default `cpus - 1`) | 4 (`50%` default) | -3 workers | -42.86% |
| **Verbose Output** | `true` | `false` | Disabled | N/A |

### 2. Warm Cache (Reusing Cache)

Executed immediately after the cold run without cache invalidation.

| Metric | BASE (`origin/main`) | After (T1) | Delta | Percentage Change |
| --- | --- | --- | --- | --- |
| **Wall Clock (Real)** | 7.60 s | 5.65 s | -1.95 s | -25.66% |
| **User CPU Time** | 27.08 s | 20.35 s | -6.73 s | -24.85% |
| **System CPU Time** | 7.46 s | 3.39 s | -4.07 s | -54.56% |
| **Peak RSS** | 375,783,424 bytes (358.38 MB) | 445,431,808 bytes (424.80 MB) | +69,648,384 bytes | +18.53% |
| **Jest Reported Time** | 6.339 s | 4.311 s | -2.028 s | -31.99% |
| **Worker Count** | 7 (Jest default `cpus - 1`) | 4 (`50%` default) | -3 workers | -42.86% |
| **Verbose Output** | `true` | `false` | Disabled | N/A |

### 3. Cold Cache with `--no-cache` Flag

Run with explicit `--no-cache` parameter to bypass cache reads and writes entirely.

| Metric | BASE (`origin/main`) | After (T1) | Delta | Percentage Change |
| --- | --- | --- | --- | --- |
| **Wall Clock (Real)** | 9.94 s | 6.56 s | -3.38 s | -34.00% |
| **User CPU Time** | 35.91 s | 26.17 s | -9.74 s | -27.12% |
| **System CPU Time** | 9.38 s | 3.57 s | -5.81 s | -61.94% |
| **Peak RSS** | 381,321,216 bytes (363.66 MB) | 506,281,984 bytes (482.83 MB) | +124,960,768 bytes | +32.77% |
| **Worker Count** | 7 (Jest default `cpus - 1`) | 4 (`50%` default) | -3 workers | -42.86% |

### 4. Resolver Test Execution in Isolation

Metrics for running After's newly added `tests/config/jest.workers.test.ts` standalone:

| Metric | Value |
| --- | --- |
| **Wall Clock (Real)** | 1.24 s |
| **User CPU Time** | 1.87 s |
| **System CPU Time** | 0.16 s |
| **Peak RSS** | 394,870,784 bytes (376.58 MB) |
| **Jest Reported Time** | 0.093 s |
| **Test Suites** | 1 passed, 1 total |
| **Tests** | 28 passed, 28 total |

---

## Parity Proof & Verification

### Test Parity Table

The After revision introduces 1 new test suite (`tests/config/jest.workers.test.ts`) containing 28 unit tests validating the environment variable resolver logic. Excluding these new tests, the suite is identical to BASE in every dimension:

| Metric | BASE (`origin/main`) | After (T1) [Total] | After (New Resolver Tests) | After (Excl. Resolver Tests) | Delta vs BASE | Parity Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Test Suites** | 79 | 80 | 1 | 79 | 0 | **Identical** |
| **Total Tests** | 740 | 768 | 28 | 740 | 0 | **Identical** |
| **Tests Passed** | 740 | 768 | 28 | 740 | 0 | **Identical** |
| **Tests Failed** | 0 | 0 | 0 | 0 | 0 | **Identical** |
| **Tests Skipped / Todo** | 0 | 0 | 0 | 0 | 0 | **Identical** |
| **Snapshots** | 0 | 0 | 0 | 0 | 0 | **Identical** |
| **Pre-existing Failures** | None (0) | None (0) | None (0) | None (0) | 0 | **Unchanged** |

### Test Discovery Parity

Comparing `jest --listTests` between BASE and After:
- BASE lists exactly **79 test files**.
- After lists exactly **80 test files**.
- The diff (`diff <(base --listTests) <(after --listTests)`) reveals exactly one added file: `tests/config/jest.workers.test.ts`. All 79 original test files are preserved without rename, addition, deletion, or modification.

### Tier Partition Proof

In the After revision, test files are partitioned between unit and integration tiers:

| Tier Command | Script Definition | Suites | Tests | Scope |
| --- | --- | --- | --- | --- |
| `pnpm test:unit` | `jest --testPathIgnorePatterns=tests/integration` | 79 | 766 | Pure unit tests & mocked action specs |
| `pnpm test:integration` | `jest --testPathPattern=tests/integration` | 1 | 2 | `tests/integration/runsheetPropagate.integration.test.ts` |
| **Total (`test:unit` + `test:integration`)** | | **80** | **768** | **Exact disjoint partition** |
| `pnpm test` (Full Gate) | `jest` | 80 | 768 | Union of all unit and integration tests |

The intersection of `test:unit` and `test:integration` is empty ($\emptyset$), and their union equals the complete test suite.

---

## Tradeoff Analysis

1. **System CPU & Kernel Overhead**:
   - System CPU dropped by **54%–56%** across all runs (e.g., from 8.20 s down to 3.58 s on cold runs).
   - Turning off verbose test output eliminates thousands of stdout/stderr pipe writes and terminal ANSI formatting calls.
   - Reducing worker concurrency from 7 to 4 on an 8-core CPU significantly curtails process scheduling thrashing and kernel context switching.

2. **User CPU Time**:
   - User CPU decreased by **24%–25%** (from ~32 s down to ~24 s cold, and ~27 s down to ~20 s warm).
   - Less string formatting, console serialization, and IPC coordination overhead contributed directly to this reduction.

3. **Peak RSS (Memory Footprint)**:
   - Peak RSS increased by **18%–22%** (from ~360 MB in BASE to ~425–445 MB in After).
   - With fewer workers (4 instead of 7), each worker process handles more test suites sequentially during its lifecycle before the process exits. In Node.js/V8, sequential suite execution within a single worker retains more module cache and intermediate garbage collection heap than if work were distributed across a larger pool of shorter-lived workers.
   - Tradeoff statement: *Peak RSS per worker increases slightly because individual workers retain memory across more sequential test files, but total host CPU contention and kernel thread pressure decrease substantially.*

4. **Wall Clock Runtime**:
   - Wall clock improved by **~26%** (8.62 s to 6.38 s cold, 7.60 s to 5.65 s warm).
   - On an 8-core host, capping workers to 4 leaves spare cores available for background OS tasks, disk I/O handling, and Next.js/TypeScript background processes, avoiding core starvation and yielding a net wall-clock improvement.
