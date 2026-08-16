import { describe, expect, it } from '@jest/globals';
import { clampCacheTtlSeconds, MAX_AUTHORIZATION_CACHE_TTL_SECONDS } from './cacheTtl';

describe('authorization cache TTL bounds', () => {
  it.each([
    ['missing', undefined, 300],
    ['malformed', 'not-a-number', 300],
    ['oversized', '3600', 300],
    ['valid', '120', 120],
    ['below minimum', '-4', 1],
  ])('normalizes %s configuration', (_name, rawValue, expected) => {
    expect(clampCacheTtlSeconds(rawValue, 300, 1)).toBe(expected);
  });

  it('defines the five-minute maximum used by both authorization caches', () => {
    expect(MAX_AUTHORIZATION_CACHE_TTL_SECONDS).toBe(300);
  });
});
