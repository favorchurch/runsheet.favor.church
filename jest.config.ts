/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import path from 'path';
import type { Config } from 'jest';
import { resolveMaxWorkers, resolveVerbose } from './jest.workers';

// @react-pdf/hyphenate is a transitive dep that sits next to @react-pdf/textkit in node_modules
// (pnpm or hoisted), and its `exports` map has no CJS condition, so point at its lib files directly.
const hyphenateDir = path.join(
  path.dirname(
    require.resolve('@react-pdf/textkit/package.json', {
      paths: [path.dirname(require.resolve('@react-pdf/renderer/package.json'))],
    }),
  ),
  '..',
  'hyphenate',
);

const config: Config = {
  maxWorkers: resolveMaxWorkers(),
  testTimeout: 30000,
  collectCoverage: false,
  moduleFileExtensions: [
    'js',
    'mjs',
    'cjs',
    'jsx',
    'ts',
    'tsx',
    'json',
    'node'
  ],
  moduleNameMapper: {
    '\\.(svg|png|jpe?g|gif|webp|avif|ico|bmp)$': '<rootDir>/tests/mocks/fileMock.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^server-only$': '<rootDir>/tests/mocks/server-only.ts',
    '^@react-pdf/hyphenate/(.*)$': `${hyphenateDir}/lib/$1.js`,
  },
  preset: 'ts-jest',
  watchman: false,
  testEnvironment: 'jest-environment-node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/.claude/',
    '<rootDir>/.worktrees/',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json'
    }],
    '^.+\\.jsx?$': '<rootDir>/src/lib/runsheetExport/jestJsTransform.cjs',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.*[\\/])?(@react-pdf|color-string|color-name|yoga-layout|jose|@auth0/nextjs-auth0|@uidotdev/usehooks|lodash-es)[\\/])',
    '\\.pnp\\.[^\\/]+$'
  ],
  verbose: resolveVerbose(),
};

export default config;
