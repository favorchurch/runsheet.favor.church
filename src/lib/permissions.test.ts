import { describe, expect, it } from '@jest/globals';
import {
  canUserAccessRunsheet,
  canUserEditRunsheet,
  getAccessGateState,
  hasFullEditorRole,
} from './permissions';
import type { AuthUser } from '@/types/AuthUser';

describe('runsheet access permissions', () => {
  it('allows an editor to access runsheets even without a viewer role', () => {
    expect(canUserAccessRunsheet({ rolesMap: { editor: ['editor-only'] } })).toBe(true);
  });

  it('denies a principal without viewer or editor access', () => {
    expect(canUserAccessRunsheet({ rolesMap: {} })).toBe(false);
  });

  it('treats a Grow editor as able to edit and access', () => {
    const user = { rolesMap: { growEditor: ['19108'] } };
    expect(canUserEditRunsheet(user)).toBe(true);
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(hasFullEditorRole(user)).toBe(false);
  });

  it('treats a Grow viewer as able to access but not edit', () => {
    const user = { rolesMap: { growViewer: ['477:2026-09-29'] } };
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(canUserEditRunsheet(user)).toBe(false);
  });

  it('lets a rostered volunteer access runsheets without editing', () => {
    const user = { rolesMap: { rosteredViewer: ['MNL:2026-09-27:15:00:00'] } };
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(canUserEditRunsheet(user)).toBe(false);
  });

  it('isMinistryTeamVolunteer alone grants neither canUserAccessRunsheet nor canUserEditRunsheet', () => {
    const rootVolunteer: AuthUser = {
      isMinistryTeamVolunteer: true,
      rolesMap: {},
    };
    expect(canUserAccessRunsheet(rootVolunteer)).toBe(false);
    expect(canUserEditRunsheet(rootVolunteer)).toBe(false);

    const accessVolunteer: AuthUser = {
      access: {
        campusIds: [1],
        connectLeaderGroupIds: [],
        regionalLeaderSections: [],
        clusterHeadSections: [],
        departmentHeadSections: [],
        runsheetCampuses: ['MNL'],
        isMinistryTeamVolunteer: true,
      },
      rolesMap: {},
    };
    expect(canUserAccessRunsheet(accessVolunteer)).toBe(false);
    expect(canUserEditRunsheet(accessVolunteer)).toBe(false);
  });
});

describe('getAccessGateState', () => {
  it('returns allowed when user holds runsheet viewer or editor roles', () => {
    expect(getAccessGateState({ rolesMap: { editor: ['MNL'] } })).toBe('allowed');
    expect(getAccessGateState({ rolesMap: { viewer: ['MNL'] } })).toBe('allowed');
    expect(getAccessGateState({ rolesMap: { rosteredViewer: ['MNL:2026-10-10:10:00:00'] } })).toBe('allowed');
  });

  it('keeps a user with a runsheet role allowed even if rosterLookupFailed (rosterLookupFailed+viewer -> allowed)', () => {
    const user: AuthUser = {
      rolesMap: { viewer: ['MNL'] },
      accessDiagnostics: {
        personResolved: true,
        membershipCountsByGroupType: {},
        rosterKeyCount: 0,
        rosterLookupFailed: true,
      },
    };
    expect(getAccessGateState(user)).toBe('allowed');

    const topLevelFailed: AuthUser = {
      rolesMap: { viewer: ['MNL'] },
      ...({ rosterLookupFailed: true } as any),
    };
    expect(getAccessGateState(topLevelFailed)).toBe('allowed');
  });

  it('returns resolution-failed when accessResolutionFailed is true (covers getSessionUser failure)', () => {
    const user: AuthUser = {
      accessResolutionFailed: true,
      rolesMap: {},
    };
    expect(getAccessGateState(user)).toBe('resolution-failed');
  });

  it('returns resolution-failed when rosterLookupFailed is true for user with no runsheet role', () => {
    const user: AuthUser = {
      accessDiagnostics: {
        personResolved: true,
        membershipCountsByGroupType: {},
        rosterKeyCount: 0,
        rosterLookupFailed: true,
      },
      rolesMap: {},
    };
    expect(getAccessGateState(user)).toBe('resolution-failed');
  });

  it('prioritizes resolution-failed over volunteer-landing when rosterLookupFailed (rosterLookupFailed+volunteer -> resolution-failed)', () => {
    const user: AuthUser = {
      isMinistryTeamVolunteer: true,
      rolesMap: {},
      accessDiagnostics: {
        personResolved: true,
        membershipCountsByGroupType: {},
        rosterKeyCount: 0,
        rosterLookupFailed: true,
      },
    };
    expect(getAccessGateState(user)).toBe('resolution-failed');

    const userWithAccessFlag: AuthUser = {
      access: {
        campusIds: [],
        connectLeaderGroupIds: [],
        regionalLeaderSections: [],
        clusterHeadSections: [],
        departmentHeadSections: [],
        runsheetCampuses: [],
        isMinistryTeamVolunteer: true,
      },
      rolesMap: {},
      accessResolutionFailed: true,
    };
    expect(getAccessGateState(userWithAccessFlag)).toBe('resolution-failed');
  });

  it('returns volunteer-landing for ministry team volunteer without runsheet role or lookup failure', () => {
    const rootVolunteer: AuthUser = {
      isMinistryTeamVolunteer: true,
      rolesMap: {},
    };
    expect(getAccessGateState(rootVolunteer)).toBe('volunteer-landing');

    const accessVolunteer: AuthUser = {
      access: {
        campusIds: [],
        connectLeaderGroupIds: [],
        regionalLeaderSections: [],
        clusterHeadSections: [],
        departmentHeadSections: [],
        runsheetCampuses: [],
        isMinistryTeamVolunteer: true,
      },
      rolesMap: {},
    };
    expect(getAccessGateState(accessVolunteer)).toBe('volunteer-landing');
  });

  it('returns ineligible when user has no roles, volunteer flag, or resolution errors', () => {
    expect(getAccessGateState(null)).toBe('ineligible');
    expect(getAccessGateState(undefined)).toBe('ineligible');
    expect(getAccessGateState({ rolesMap: {} })).toBe('ineligible');
    expect(getAccessGateState({ rolesMap: { other: ['1'] } })).toBe('ineligible');
  });
});

