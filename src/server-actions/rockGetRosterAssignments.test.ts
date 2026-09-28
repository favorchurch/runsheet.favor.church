import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetRosterAssignments } from './rockGetRosterAssignments';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const SESSION = {
  rolesMap: { editor: ['7001'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

/** Group locations + services, as `/GroupLocations?$expand=Schedules,Location` returns them. */
function groupLocations() {
  return [
    {
      GroupId: 19100,
      LocationId: 475,
      Location: { Id: 475, Name: 'Service Director' },
      Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }],
    },
  ];
}

describe('rockGetRosterAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue(SESSION);
  });

  it('reports unlinked for a non-MNL runsheet without calling Rock', async () => {
    const res = await rockGetRosterAssignments('BNE Service // September 27, 2026 // 10AM');
    expect(res).toMatchObject({ success: true, linked: false, roles: [] });
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('returns confirmed and pending people, excluding declines', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([] as any) // 19144
      .mockResolvedValueOnce([{ Id: 900, GroupId: 19100, LocationId: 475 }] as any) // occurrences
      .mockResolvedValueOnce([
        // RSVP 1 = Yes (confirmed), 3 = Unknown (pending), 0 = No (declined).
        { Id: 1, OccurrenceId: 900, RSVP: 1, PersonAliasId: 5010 },
        { Id: 2, OccurrenceId: 900, RSVP: 0, PersonAliasId: 5020 },
      ] as any) // attendances
      .mockResolvedValueOnce([{ Id: 5010, PersonId: 10 }] as any) // person aliases
      .mockResolvedValueOnce([{ Id: 10, NickName: 'Juan', LastName: 'Dela Cruz' }] as any); // people

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(res.linked).toBe(true);
    expect(res.scheduleId).toBe(565);
    expect(res.isoDate).toBe('2026-09-27');
    expect(res.roles.find((r) => r.roleTitle === 'Roster: Service Director')?.people).toEqual([
      { personId: 10, name: 'Juan Dela Cruz' },
    ]);
  });

  it('shows accepted, maybe and unanswered people, and hides only declines', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([{ Id: 900, GroupId: 19100, LocationId: 475 }] as any)
      .mockResolvedValueOnce([
        { Id: 1, OccurrenceId: 900, RSVP: 1, PersonAliasId: 5010 }, // Yes
        { Id: 2, OccurrenceId: 900, RSVP: 3, PersonAliasId: 5020 }, // Unknown / pending
        { Id: 3, OccurrenceId: 900, RSVP: 2, PersonAliasId: 5030 }, // Maybe
        { Id: 4, OccurrenceId: 900, RSVP: 0, PersonAliasId: 5040 }, // No / declined
      ] as any)
      .mockResolvedValueOnce([
        { Id: 5010, PersonId: 10 },
        { Id: 5020, PersonId: 20 },
        { Id: 5030, PersonId: 30 },
      ] as any)
      .mockResolvedValueOnce([
        { Id: 10, NickName: 'Accepted', LastName: 'Volunteer' },
        { Id: 20, NickName: 'Pending', LastName: 'Volunteer' },
        { Id: 30, NickName: 'Maybe', LastName: 'Volunteer' },
      ] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(
      res.roles.find((r) => r.roleTitle === 'Roster: Service Director')?.people.map((p) => p.name),
    ).toEqual(['Accepted Volunteer', 'Pending Volunteer', 'Maybe Volunteer']);
  });

  it('never asks Rock for a filter long enough to trip the 100-node OData limit', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    const occurrenceCalls = mockRockGet.mock.calls.filter(
      (c) => c[0] === '/AttendanceOccurrences',
    );
    expect(occurrenceCalls.length).toBeGreaterThan(0);
    for (const call of occurrenceCalls) {
      const filter = String((call[1] as any).$filter);
      // The group OR-chain on top of the location chain is what blew the limit.
      expect(filter).not.toContain('GroupId eq');
      expect((filter.match(/ or /g) || []).length).toBeLessThan(10);
    }
  });

  it('omits roles whose location does not carry this schedule', async () => {
    // Only Service Director (475) is attached to schedule 565 here, so the other
    // nine roles must not appear at all — the card falls back to free text for them.
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any) // no occurrences
      .mockResolvedValueOnce([] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(res.roles.map((r) => r.roleTitle)).toEqual(['Roster: Service Director']);
  });

  it('keeps a linked role that simply has nobody rostered', async () => {
    mockRockGet
      .mockResolvedValueOnce(groupLocations() as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    // Present with an empty list — linked but unfilled, not unlinked.
    expect(res.roles).toEqual([{ roleTitle: 'Roster: Service Director', people: [] }]);
  });

  it('marks a non-MNL runsheet as not Rock-managed, so it keeps its free-text card', async () => {
    const res = await rockGetRosterAssignments('BNE Service // September 27, 2026 // 10AM');
    expect(res).toMatchObject({ success: true, rockManaged: false, linked: false });
  });

  it('is Rock-managed but unlinked when no Group Scheduler team carries the schedule', async () => {
    // A CIW-style service: MNL, but none of the five teams roster it, so there
    // is no roster to show and none to attach.
    mockRockGet
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const res = await rockGetRosterAssignments('MNL CIW // September 27, 2026 // 3PM');

    expect(res).toMatchObject({ success: true, rockManaged: true, linked: false, roles: [] });
  });

  it('stays Rock-managed but not "no roster" when the Rock read fails', async () => {
    // success:false is what keeps the card visible on a transient Rock error —
    // hiding a roster the team is about to use would be the worse failure.
    mockRockGet.mockRejectedValue(new Error('Rock API error: 500'));
    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');
    expect(res).toMatchObject({ success: false, rockManaged: true, linked: false });
  });

  it('fails soft when Rock throws', async () => {
    mockRockGet.mockRejectedValue(new Error('Rock API error: 500'));
    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');
    expect(res.success).toBe(false);
    expect(res.roles).toEqual([]);
    expect(res.error).toBe('Could not read the roster from Rock.');
  });

  it('denies a session with no runsheet view access', async () => {
    mockSession.mockResolvedValueOnce({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);
    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');
    expect(res.success).toBe(false);
    expect(mockRockGet).not.toHaveBeenCalled();
  });
});
