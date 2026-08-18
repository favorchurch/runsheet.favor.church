import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession, invalidateRockSession, type ResolveResult } from './getRockSession';
import { getServerSession } from './getServerSession';
import { rockResolveAccess } from '@/server-actions/internal/rockResolveAccess';
import { clearSessionCache, getSessionCache, setSessionCache } from '@/server-actions/sessionCache';

jest.mock('./getServerSession', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockResolveAccess', () => ({
  CloudflareBlockError: class CloudflareBlockError extends Error {},
  NoAccessError: class NoAccessError extends Error {},
  NoRockPersonError: class NoRockPersonError extends Error {},
  rockResolveAccess: jest.fn(),
}));

jest.mock('@/server-actions/sessionCache', () => ({
  clearSessionCache: jest.fn(),
  getSessionCache: jest.fn(),
  setSessionCache: jest.fn(),
}));

const mockGetServerSession = jest.mocked(getServerSession);
const mockRockResolveAccess = jest.mocked(rockResolveAccess);
const mockGetSessionCache = jest.mocked(getSessionCache);
const mockSetSessionCache = jest.mocked(setSessionCache);
const mockClearSessionCache = jest.mocked(clearSessionCache);

function resolvedResult(id: number): ResolveResult {
  return {
    contact: { id },
    rolesMap: {},
    access: {
      campusIds: [],
      connectLeaderGroupIds: [],
      regionalLeaderSections: [],
      clusterHeadSections: [],
      departmentHeadSections: [],
      runsheetCampuses: [],
    },
  };
}

function sessionFor(profile: Record<string, unknown>) {
  return { user: profile } as never;
}

describe('getRockSession rock_person_ids claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionCache.mockResolvedValue(undefined);
    mockSetSessionCache.mockResolvedValue(undefined);
  });

  it('runsheet-claim-parse', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [101, 202],
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(303));

    const result = await getRockSession();

    expect(result.personId).toBe(303);
    expect(result.personIds).toEqual([101, 202, 303]);
  });

  it('falls back to the scalar for an absent claim', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(result.personIds).toEqual([101]);
  });

  it('falls back to the scalar for a malformed claim', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [101, '202'],
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(result.personIds).toEqual([101]);
  });

  it('omits zero when Rock did not find a person', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': false,
        email: 'fallback@example.com',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(456));

    const result = await getRockSession();

    expect(result.personIds).toEqual([456]);
    expect(result.personIds).not.toContain(0);
  });

  it('deduplicates and copies valid claim entries', async () => {
    const claimedPersonIds = [101, 101, 202];
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': claimedPersonIds,
      }),
    );
    mockGetSessionCache.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(result.personIds).toEqual([101, 202]);
    result.personIds.push(303);
    expect(claimedPersonIds).toEqual([101, 101, 202]);
  });

  it('includes the scalar in a valid cache-hit claim', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [202],
      }),
    );
    mockGetSessionCache.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(result.personId).toBe(101);
    expect(result.personIds).toEqual([202, 101]);
    expect(mockRockResolveAccess).not.toHaveBeenCalled();
  });

  it('does not use an unverified email for Rock fallback resolution', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': false,
        email: 'unverified@example.com',
        email_verified: false,
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], '');
  });

  it('uses the email fallback when email_verified is affirmatively true', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        email: 'staff@favor.church',
        email_verified: true,
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(152));

    const result = await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], 'staff@favor.church');
    expect(result.personId).toBe(152);
  });

  it('uses the email fallback when email_verified arrives as the string "true"', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        email: 'staff@favor.church',
        email_verified: 'true',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(152));

    const result = await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], 'staff@favor.church');
    expect(result.personId).toBe(152);
  });

  // G14: an omitted claim is not a verified claim. Without this, any Auth0
  // connection that does not assert email_verified turns a staff email address
  // into a staff-access path.
  it('does not use the email fallback when the email_verified claim is omitted', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        email: 'staff@favor.church',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], '');
  });

  it('does not use the email fallback for a non-boolean email_verified claim', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        email: 'staff@favor.church',
        email_verified: 'yes',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], '');
  });

  it('tolerates rock_person_id without an explicit rock_person_found claim, but still withholds the unverified email', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_id': 152,
        email: 'staff@favor.church',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(152));

    const result = await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([152], '');
    expect(result.personId).toBe(152);
  });

  it('does not union the claimed ids when personFound is false, even with a positive stray personId claim (done-criteria 3)', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': false,
        'https://auth.favor.church/rock_person_id': 909,
        'https://auth.favor.church/rock_person_ids': [909, 910],
        email: 'unverified@example.com',
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    // personFound: false means the scalar id itself is untrusted, so personId
    // resolves to 0 upstream and the claimed array must not resurrect it.
    expect(mockRockResolveAccess).toHaveBeenCalledWith([], '');
  });

  it('does not union the claimed ids when personId resolves to 0 despite personFound being true (done-criteria 3)', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 0,
        'https://auth.favor.church/rock_person_ids': [911, 912],
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([], '');
  });

  it('does not cache a partial resolve result (done-criteria 6)', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [101, 202],
      }),
    );
    mockRockResolveAccess.mockResolvedValue({ ...resolvedResult(101), partial: true });

    await getRockSession();

    expect(mockSetSessionCache).not.toHaveBeenCalled();
  });

  it('caches a non-partial resolve result normally, for contrast with the partial case above', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [101, 202],
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    await getRockSession();

    expect(mockSetSessionCache).toHaveBeenCalledWith(101, [101, 202], resolvedResult(101));
  });

  // Pins the primaryId half of read/write key agreement. The read is keyed on
  // the CLAIM id; if the write ever keys on the RESOLVED id again (the v4 bug),
  // every subsequent read misses for the whole TTL. Every other cache test has
  // resolvedPersonId === personId, so this is the only test that can catch it.
  it('keys the cache write on the claim personId, not the resolved contact id', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 42,
        'https://auth.favor.church/rock_person_ids': [42, 77],
      }),
    );
    // Rock resolves a DIFFERENT id than the claim carried.
    mockRockResolveAccess.mockResolvedValue(resolvedResult(99));

    await getRockSession();

    expect(mockGetSessionCache).toHaveBeenCalledWith(42, [42, 77]);
    expect(mockSetSessionCache).toHaveBeenCalledWith(42, [42, 77], resolvedResult(99));
  });

  // The pure email-fallback path (personId === 0) must not write at all: the
  // read is gated on personId > 0 so nothing could read it back, and
  // invalidateRockSession cannot derive its key from the claims, which would
  // leave an unevictable entry serving access for the full TTL after logout.
  it('does not write a cache entry on the pure email-fallback path', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        email: 'staff@favor.church',
        email_verified: true,
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(152));

    const result = await getRockSession();

    expect(result.personId).toBe(152);
    expect(mockSetSessionCache).not.toHaveBeenCalled();
  });

  it('invalidateRockSession clears the exact key the session actually wrote (done-criteria 8)', async () => {
    const profile = {
      'https://auth.favor.church/rock_person_found': true,
      'https://auth.favor.church/rock_person_id': 101,
      'https://auth.favor.church/rock_person_ids': [101, 202],
    };
    mockGetServerSession.mockResolvedValue(sessionFor(profile));
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    await getRockSession();
    expect(mockSetSessionCache).toHaveBeenCalledTimes(1);
    const [writePrimaryId, writeUnionIds] = mockSetSessionCache.mock.calls[0];

    mockGetServerSession.mockResolvedValue(sessionFor(profile));
    await invalidateRockSession();

    expect(mockClearSessionCache).toHaveBeenCalledWith(writePrimaryId, writeUnionIds);
  });

  it('regression: an absent or rejected rock_person_ids claim resolves identically to the pre-union scalar path (done-criteria 9, exempt from mutation probe)', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
        'https://auth.favor.church/rock_person_ids': [101, 'not-a-number'],
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalledWith([101], '');
    expect(result.personId).toBe(101);
    expect(result.personIds).toEqual([101]);
  });
});
