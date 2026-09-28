import { describe, expect, it } from '@jest/globals';
import { VITAL_ROLES } from '@/components/runsheet/EventTeamRosterCard';
import {
  getRockRosterRole,
  isRockLinkedCampus,
  ROCK_ROSTER_GROUP_IDS,
  ROCK_ROSTER_ROLES,
  usableRoleLocationIds,
} from './rockRosterRoles';

describe('ROCK_ROSTER_ROLES', () => {
  it('maps every vital role exactly once', () => {
    expect(ROCK_ROSTER_ROLES.map((r) => r.roleTitle).sort()).toEqual(
      VITAL_ROLES.map((r) => `Roster: ${r}`).sort(),
    );
  });

  it('lists the five Group Scheduler groups', () => {
    expect([...ROCK_ROSTER_GROUP_IDS].sort()).toEqual([19095, 19096, 19100, 19109, 19144]);
  });

  it('never reuses a locationId across roles', () => {
    const all = ROCK_ROSTER_ROLES.flatMap((r) => r.locationIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('getRockRosterRole', () => {
  it('resolves a single-slot role', () => {
    expect(getRockRosterRole('Roster: Service Director')).toEqual({
      roleTitle: 'Roster: Service Director',
      groupId: 19100,
      locationIds: [475],
    });
  });

  it('keeps multi-slot fill order', () => {
    expect(getRockRosterRole('Roster: Worship Leaders')?.locationIds).toEqual([799, 800]);
    expect(getRockRosterRole('Roster: Offstage Director')?.locationIds).toEqual([498, 499]);
  });

  it('returns null for an unmapped title', () => {
    expect(getRockRosterRole('Roster: Coffee Captain')).toBeNull();
    expect(getRockRosterRole('Welcome')).toBeNull();
  });
});

describe('isRockLinkedCampus', () => {
  it('accepts MNL and rejects everything else', () => {
    expect(isRockLinkedCampus('MNL Crowne // September 27, 2026 // 3PM')).toBe(true);
    expect(isRockLinkedCampus('BNE Service // September 27, 2026 // 10AM')).toBe(false);
    expect(isRockLinkedCampus('SEL Service // September 27, 2026 // 10AM')).toBe(false);
  });
});

describe('usableRoleLocationIds', () => {
  const worshipLeaders = getRockRosterRole('Roster: Worship Leaders')!;
  const securityLead = getRockRosterRole('Roster: Security Lead')!;

  it('keeps the slots whose location carries the schedule', () => {
    const byLocation = new Map([
      [799, new Set([35, 565])],
      [800, new Set([35, 565])],
    ]);
    expect(usableRoleLocationIds(worshipLeaders, byLocation, 565)).toEqual([799, 800]);
  });

  it('drops a slot whose location does not carry the schedule, keeping fill order', () => {
    const byLocation = new Map([
      [799, new Set([565])],
      [800, new Set([27])],
    ]);
    expect(usableRoleLocationIds(worshipLeaders, byLocation, 565)).toEqual([799]);
  });

  it('returns nothing for a role Rock does not schedule for this service', () => {
    // Security (748) carries no MNL Family Night (35) schedule in Rock.
    const byLocation = new Map([[748, new Set([27, 565])]]);
    expect(usableRoleLocationIds(securityLead, byLocation, 35)).toEqual([]);
  });

  it('returns nothing when the location is absent entirely', () => {
    expect(usableRoleLocationIds(securityLead, new Map(), 565)).toEqual([]);
  });
});
