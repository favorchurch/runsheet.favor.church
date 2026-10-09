import { describe, expect, it, jest } from '@jest/globals';
import { formatAccessDenial, logAccessDenial, type AccessDiagnostics } from './accessDiagnostics';
import type { AuthUser } from '@/types/AuthUser';

describe('accessDiagnostics', () => {
  it('formatAccessDenial formats structured line without logging', () => {
    const line = formatAccessDenial({
      personId: 42,
      personResolved: true,
      membershipCountsByGroupType: { 23: 1 },
      rosterKeyCount: 0,
      rosterLookupFailed: false,
      reason: 'test-reason',
    });
    expect(line.startsWith('[runsheet-access] denial')).toBe(true);
    expect(line).toContain('personId=42');
  });
  it('logAccessDenial emits one line prefixed [runsheet-access] denial with personId, personResolved, membership counts by group type, rosterKeyCount, rosterLookupFailed, reason and no email', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const testEmail = 'sensitive.volunteer@favor.church';
    const user: AuthUser = {
      sub: '12302',
      email: testEmail,
      contact: {
        id: 12302,
        email: testEmail,
        fullName: 'Jane Volunteer',
      },
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
        personId: 12302,
        personResolved: true,
        membershipCountsByGroupType: { 23: 2, 28: 1 },
        rosterKeyCount: 0,
        rosterLookupFailed: false,
      },
    };

    const logged = logAccessDenial(user, 'volunteer-landing');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(logged);

    // Prefix check
    expect(logged.startsWith('[runsheet-access] denial')).toBe(true);

    // Diagnostics fields check
    expect(logged).toContain('personId=12302');
    expect(logged).toContain('personResolved=true');
    expect(logged).toContain('membershipCountsByGroupType={"23":2,"28":1}');
    expect(logged).toContain('rosterKeyCount=0');
    expect(logged).toContain('rosterLookupFailed=false');
    expect(logged).toContain('reason=volunteer-landing');

    // Assert no email appears in the output
    expect(logged).not.toContain(testEmail);
    expect(logged).not.toContain('@');

    warnSpy.mockRestore();
  });

  it('redacts email even if accidentally passed inside reason string', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const emailInReason = 'user@example.com';
    const logged = logAccessDenial({
      personId: 555,
      personResolved: true,
      membershipCountsByGroupType: { 23: 1 },
      rosterKeyCount: 1,
      rosterLookupFailed: false,
      reason: `failed for user ${emailInReason}`,
    });

    expect(logged).not.toContain(emailInReason);
    expect(logged).toContain('[REDACTED_EMAIL]');
    expect(logged).not.toContain('@');

    warnSpy.mockRestore();
  });

  it('handles unresolved person with 0 counts and rosterLookupFailed=true', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const logged = logAccessDenial({
      personId: 0,
      personResolved: false,
      membershipCountsByGroupType: {},
      rosterKeyCount: 0,
      rosterLookupFailed: true,
      reason: 'resolution-failed',
    });

    expect(logged.startsWith('[runsheet-access] denial')).toBe(true);
    expect(logged).toContain('personId=0');
    expect(logged).toContain('personResolved=false');
    expect(logged).toContain('membershipCountsByGroupType={}');
    expect(logged).toContain('rosterKeyCount=0');
    expect(logged).toContain('rosterLookupFailed=true');
    expect(logged).toContain('reason=resolution-failed');

    warnSpy.mockRestore();
  });

  it('asserts real counts on an AuthUser originating from a session-cache hit', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Simulating user constructed after a cache hit with CachedSession.accessDiagnostics
    const cachedDiagnostics: AccessDiagnostics = {
      personId: 9876,
      personResolved: true,
      membershipCountsByGroupType: { 1: 1, 23: 3, 28: 2 },
      rosterKeyCount: 4,
      rosterLookupFailed: false,
    };

    const cacheHitUser: AuthUser = {
      sub: '9876',
      contact: { id: 9876, email: 'secret@domain.org' },
      accessDiagnostics: cachedDiagnostics,
    };

    const output = logAccessDenial(cacheHitUser, 'ineligible');

    expect(output).toContain('personId=9876');
    expect(output).toContain('personResolved=true');
    expect(output).toContain('membershipCountsByGroupType={"1":1,"23":3,"28":2}');
    expect(output).toContain('rosterKeyCount=4');
    expect(output).toContain('rosterLookupFailed=false');
    expect(output).toContain('reason=ineligible');
    expect(output).not.toContain('secret@domain.org');

    warnSpy.mockRestore();
  });
});
