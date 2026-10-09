import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession, invalidateRockSession, type ResolveResult } from './getRockSession';
import { getServerSession } from './getServerSession';
import { getSessionUser } from './getSessionUser';
import { logAccessDenial } from '@/lib/accessDiagnostics';
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

  it('does not cache a resolve whose roster lookup failed (rosterLookupFailed + partial)', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
      }),
    );
    mockRockResolveAccess.mockResolvedValue({ ...resolvedResult(101), rosterLookupFailed: true, partial: true });

    const session = await getRockSession();

    expect(session.rosterLookupFailed).toBe(true);
    expect(mockSetSessionCache).not.toHaveBeenCalled();
  });

  it('does not cache when resolved contact id is 0', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
      }),
    );
    mockRockResolveAccess.mockResolvedValue(resolvedResult(0));

    await getRockSession();

    expect(mockSetSessionCache).not.toHaveBeenCalled();
  });

  it('bypasses a cached entry if its contact id is 0', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
      }),
    );
    mockGetSessionCache.mockResolvedValueOnce(resolvedResult(0));
    mockRockResolveAccess.mockResolvedValue(resolvedResult(101));

    const result = await getRockSession();

    expect(mockRockResolveAccess).toHaveBeenCalled();
    expect(result.personId).toBe(101);
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

  // #25: cache hit and cache miss must agree on personId. They diverged only when
  // the primary id failed validity and the email fallback resolved someone else —
  // the case the person-id union work made a supported path.
  it('returns the same personId on a cache hit as on a cache miss when the resolved id differs from the claim', async () => {
    const profile = {
      'https://auth.favor.church/rock_person_found': true,
      'https://auth.favor.church/rock_person_id': 911,
      'https://auth.favor.church/rock_person_ids': [911, 912],
      email: 'shared@favor.church',
      email_verified: true,
    };

    // Miss: Rock resolves 913 (the email fallback landed on another person).
    mockGetServerSession.mockResolvedValue(sessionFor(profile));
    mockRockResolveAccess.mockResolvedValue(resolvedResult(913));
    const onMiss = await getRockSession();

    // Hit: the same payload comes back from cache.
    jest.clearAllMocks();
    mockSetSessionCache.mockResolvedValue(undefined);
    mockGetServerSession.mockResolvedValue(sessionFor(profile));
    mockGetSessionCache.mockResolvedValue(resolvedResult(913));
    const onHit = await getRockSession();

    expect(onMiss.personId).toBe(913);
    expect(onHit.personId).toBe(913);
    expect(onHit.personId).toBe(onMiss.personId);
    expect(mockRockResolveAccess).not.toHaveBeenCalled();
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

  it('proves a failing fetchKidsScheduleIds yields rosterLookupFailed=true and no cache write', async () => {
    mockGetServerSession.mockResolvedValue(
      sessionFor({
        'https://auth.favor.church/rock_person_found': true,
        'https://auth.favor.church/rock_person_id': 101,
      }),
    );
    mockRockResolveAccess.mockResolvedValue({
      ...resolvedResult(101),
      partial: true,
      rosterLookupFailed: true,
    });

    const result = await getRockSession();

    expect(result.rosterLookupFailed).toBe(true);
    expect(mockSetSessionCache).not.toHaveBeenCalled();
  });

  describe('getSessionUser', () => {
    it('returns accessResolutionFailed=true (and no rolesMap) when getRockSession throws, and logs the error class name without secrets', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const secretToken = 'secret-auth-token-12345';
      const secretUrl = 'https://rock.favor.church/api/People?key=supersecret';

      mockGetServerSession.mockResolvedValue(
        sessionFor({
          email: 'user@example.com',
          rolesMap: { editor: ['123'] },
          'https://auth.favor.church/rock_person_found': true,
          'https://auth.favor.church/rock_person_id': 101,
        }),
      );

      // Make rockResolveAccess throw an error with sensitive info in message
      const errorWithSecrets = new Error(`Request to ${secretUrl} failed with token ${secretToken}`);
      errorWithSecrets.name = 'CustomRockApiError';
      mockRockResolveAccess.mockRejectedValue(errorWithSecrets);

      const user = await getSessionUser();

      expect(user.accessResolutionFailed).toBe(true);
      expect(user.rolesMap).toBeUndefined();

      // Check the log call
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[getSessionUser] getRockSession failed: CustomRockApiError'),
      );
      const loggedArg = warnSpy.mock.calls.find((call) =>
        String(call[0]).includes('[getSessionUser] getRockSession failed:'),
      )?.[0];
      expect(String(loggedArg)).not.toContain(secretToken);
      expect(String(loggedArg)).not.toContain(secretUrl);
      expect(String(loggedArg)).not.toContain('user@example.com');

      warnSpy.mockRestore();
    });

    it('passes accessDiagnostics and isMinistryTeamVolunteer to AuthUser on cache hit, and logAccessDenial emits real counts', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      mockGetServerSession.mockResolvedValue(
        sessionFor({
          'https://auth.favor.church/rock_person_found': true,
          'https://auth.favor.church/rock_person_id': 101,
          email: 'cached.volunteer@favor.church',
        }),
      );

      // Cached session entry with accessDiagnostics
      mockGetSessionCache.mockResolvedValueOnce({
        contact: { id: 101, email: 'cached.volunteer@favor.church' },
        rolesMap: {},
        access: {
          campusIds: [1],
          connectLeaderGroupIds: [],
          regionalLeaderSections: [],
          clusterHeadSections: [],
          departmentHeadSections: [],
          runsheetCampuses: [],
          isMinistryTeamVolunteer: true,
        },
        isMinistryTeamVolunteer: true,
        accessDiagnostics: {
          personId: 101,
          personResolved: true,
          membershipCountsByGroupType: { 23: 1, 28: 2 },
          rosterKeyCount: 0,
          rosterLookupFailed: false,
        },
      });

      const user = await getSessionUser();

      expect(user.sub).toBe('101');
      expect(user.isMinistryTeamVolunteer).toBe(true);
      expect(user.rosterLookupFailed).toBe(false);
      expect(user.accessDiagnostics).toBeDefined();
      expect(user.accessDiagnostics?.membershipCountsByGroupType).toEqual({ 23: 1, 28: 2 });

      // Now call logAccessDenial with this user and assert real counts
      const output = logAccessDenial(user, 'volunteer-landing');

      expect(output.startsWith('[runsheet-access] denial')).toBe(true);
      expect(output).toContain('personId=101');
      expect(output).toContain('personResolved=true');
      expect(output).toContain('membershipCountsByGroupType={"23":1,"28":2}');
      expect(output).toContain('rosterKeyCount=0');
      expect(output).toContain('rosterLookupFailed=false');
      expect(output).toContain('reason=volunteer-landing');
      expect(output).not.toContain('cached.volunteer@favor.church');

      warnSpy.mockRestore();
    });

    it('copies rosterLookupFailed from rockSession to AuthUser when rockResolveAccess sets rosterLookupFailed=true', async () => {
      mockGetServerSession.mockResolvedValue(
        sessionFor({
          'https://auth.favor.church/rock_person_found': true,
          'https://auth.favor.church/rock_person_id': 101,
        }),
      );

      mockRockResolveAccess.mockResolvedValueOnce({
        contact: { id: 101 },
        rolesMap: {},
        access: {
          campusIds: [],
          connectLeaderGroupIds: [],
          regionalLeaderSections: [],
          clusterHeadSections: [],
          departmentHeadSections: [],
          runsheetCampuses: [],
        },
        rosterLookupFailed: true,
        partial: true,
        accessDiagnostics: {
          personId: 101,
          personResolved: true,
          membershipCountsByGroupType: {},
          rosterKeyCount: 0,
          rosterLookupFailed: true,
        },
      });

      const user = await getSessionUser();
      expect(user.rosterLookupFailed).toBe(true);
      expect(user.accessDiagnostics?.rosterLookupFailed).toBe(true);
    });
  });
});

