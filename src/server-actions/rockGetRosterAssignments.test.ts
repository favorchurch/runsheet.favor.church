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
      .mockResolvedValueOnce([{ Id: 900, GroupId: 19100, LocationId: 475 }] as any)
      .mockResolvedValueOnce([
        {
          Id: 1,
          OccurrenceId: 900,
          RSVP: 2,
          PersonAlias: { PersonId: 10, Person: { NickName: 'Juan', LastName: 'Dela Cruz' } },
        },
        {
          Id: 2,
          OccurrenceId: 900,
          RSVP: 1,
          PersonAlias: { PersonId: 20, Person: { NickName: 'Declined', LastName: 'Person' } },
        },
      ] as any);

    const res = await rockGetRosterAssignments('MNL Crowne // September 27, 2026 // 3PM');

    expect(res.linked).toBe(true);
    expect(res.scheduleId).toBe(565);
    expect(res.isoDate).toBe('2026-09-27');
    expect(res.roles.find((r) => r.roleTitle === 'Roster: Service Director')?.people).toEqual([
      { personId: 10, name: 'Juan Dela Cruz' },
    ]);
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
