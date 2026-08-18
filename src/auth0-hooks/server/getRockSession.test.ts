import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession, type ResolveResult } from './getRockSession';
import { getServerSession } from './getServerSession';
import { rockResolveAccess } from '@/server-actions/internal/rockResolveAccess';
import { getSessionCache, setSessionCache } from '@/server-actions/sessionCache';

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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(0, '');
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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(0, 'staff@favor.church');
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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(0, 'staff@favor.church');
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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(0, '');
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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(0, '');
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

    expect(mockRockResolveAccess).toHaveBeenCalledWith(152, '');
    expect(result.personId).toBe(152);
  });
});
