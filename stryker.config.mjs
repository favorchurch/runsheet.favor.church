// @ts-check
// Mutation testing for deterministic business-rule modules only. UI components are excluded.
// Baseline and surviving-mutant notes: docs/mutation/baseline.md

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/jest-runner', '@stryker-mutator/typescript-checker'],
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.ts',
    enableFindRelatedTests: true,
    // jsdom docblock suites (components, userPreferences, pageAuthGates) bypass Stryker's coverage env, and
    // integration suites hit live services. Neither exercises the mutated modules.
    config: {
      testPathIgnorePatterns: [
        '<rootDir>/.claude/',
        '<rootDir>/.worktrees/',
        '<rootDir>/tests/integration/',
        '/components/',
        '<rootDir>/src/lib/userPreferences.test.ts',
        '<rootDir>/tests/unit/pages/pageAuthGates.test.tsx',
      ],
    },
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  typescriptChecker: { prioritizePerformanceOverAccuracy: true },
  mutate: [
    'src/lib/runsheetDate.ts',
    'src/lib/runsheetKind.ts',
    'src/lib/runsheetCampus.ts',
    'src/lib/runsheetPropagate.ts',
    'src/lib/runsheetMatch.ts',
    'src/lib/runsheetAccessPolicy.ts',
    'src/lib/runsheetChannelAccess.ts',
    'src/lib/growAccessPolicy.ts',
    'src/lib/rosterAccess.ts',
    'src/lib/rockRosterSlots.ts',
    'src/lib/rockServiceSchedule.ts',
    'src/lib/permissions.ts',
    'src/lib/runsheetInlineDiff.ts',
  ],
  // 16 GiB machine: at most two test-runner processes.
  concurrency: 2,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  timeoutMS: 30000,
};

export default config;
