/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from 'jest';

const config: Config = {
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
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jose|@auth0/nextjs-auth0|@uidotdev/usehooks|lodash-es)/)',
    '\\.pnp\\.[^\\/]+$'
  ],
  verbose: true,
};

export default config;
