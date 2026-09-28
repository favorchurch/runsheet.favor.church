import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({
  assertAuthenticated: jest.fn(async () => undefined),
}));
jest.mock('@/server-actions/internal/rockObjectCache', () => ({
  readRockObjectCache: jest.fn(async () => ({ hit: false })),
  writeRockObjectCache: jest.fn(async () => undefined),
  bustRockObjectCache: jest.fn(async () => undefined),
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

import { rockPut } from './rockFetch';

describe('rockPut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response('', { status: 200 })) as any;
  });

  it('issues a PUT with the params in the querystring and no caching', async () => {
    await rockPut('/Attendances/ScheduledPersonRemove', { attendanceId: 42 });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/Attendances/ScheduledPersonRemove?attendanceId=42');
    expect(options.method).toBe('PUT');
    expect(options.cache).toBe('no-store');
  });

  it('throws on a non-OK response so callers can fail closed', async () => {
    global.fetch = jest.fn(async () => new Response('denied', { status: 401 })) as any;
    await expect(rockPut('/Attendances/ScheduledPersonRemove', { attendanceId: 42 })).rejects.toThrow(
      /401/,
    );
  });
});
