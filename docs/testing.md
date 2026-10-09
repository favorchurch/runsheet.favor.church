# Testing Guide

This document describes the testing tiers, commands, configuration, and environment controls for the Favor Runsheet Platform.

## Test Commands

The repository provides explicit npm scripts for running tests:

| Command | Description | Scope / Tier |
| --- | --- | --- |
| `pnpm test` | Runs the complete test suite | Full gate (unit + integration) |
| `pnpm test:unit` | Runs unit tests | All tests outside `tests/integration/` |
| `pnpm test:integration` | Runs integration tests | Tests located in `tests/integration/` |
| `pnpm test:changed` | Runs tests related to changed files | Git working tree diff (`jest --onlyChanged`) |

> [!IMPORTANT]
> Neither `pnpm test:changed` nor `pnpm test:unit` serves as the full gate. `pnpm test` must always be run to validate the complete suite before merging or completing tasks.

## Test Tiers

The test suite is divided into explicit tiers:

1. **Unit Tests (`pnpm test:unit`)**:
   - Covers pure helpers, UI components, date/runsheet utilities, and server action business logic with in-memory doubles or mocked dependencies.
   - Located across `src/**/*.test.ts(x)`, `tests/unit/**`, and `tests/config/**`.
   - Fast, deterministic, and isolated.

2. **Integration Tests (`pnpm test:integration`)**:
   - Covers multi-step workflows, write paths, and failure isolation (such as runsheet propagation across multiple targets) with mocked external Rock boundaries.
   - Located in `tests/integration/`.

3. **Current Tiers and Non-Existent Tiers**:
   - **No performance tier exists today**: There are currently no benchmark, load, or stress test suites.
   - **No live / E2E tier exists today**: There are currently no end-to-end tests executed against a live Rock RMS or Auth0 instance. All tests execute against hermetic local mocks and fixtures.

The file lists for `test:unit` and `test:integration` are disjoint, and their union equals the full `test` suite.

## Environment Switches and Resource-Aware Configuration

Jest workers and verbosity are dynamically resolved via `jest.workers.ts` and loaded by `jest.config.ts`.

### `JEST_MAX_WORKERS`

Controls the number of worker processes spawned by Jest.

- **Default**: When unset, Jest uses `50%` of available CPU cores.
- **Valid values**:
  - Positive integers (e.g., `JEST_MAX_WORKERS=2` or `JEST_MAX_WORKERS=4`).
  - Valid percentages between 1% and 100% (e.g., `JEST_MAX_WORKERS=25%` or `JEST_MAX_WORKERS=50%`).
- **Invalid-value fallback**:
  - Invalid values—including `0`, negative numbers (`-1`), non-numeric strings (`abc`), out-of-range percentages (`0%`, `150%`), and empty strings (`""`)—automatically fall back to `50%`.
  - When an invalid value is encountered, a single warning is emitted to `stderr` identifying the bad value (e.g., `Invalid JEST_MAX_WORKERS value "0". Falling back to 50%.`).

### `JEST_VERBOSE`

Controls verbose reporting during test execution.

- **Default**: `false` (verbose output disabled).
- Setting `JEST_VERBOSE=true` enables verbose test logging.
- Any other value (e.g., `false`, `0`, `1`, `abc`, empty string) or leaving it unset leaves verbose disabled (`false`).
