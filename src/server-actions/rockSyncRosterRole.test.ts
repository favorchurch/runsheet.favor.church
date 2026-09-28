import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';
import { rockSyncRosterRole } from './rockSyncRosterRole';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPost: jest.fn(),
  rockPut: jest.fn(),
}));

const mockSession = jest.mocked(getRockSession);
const mockRockPut = jest.mocked(rockPut);
const mockRockGet = jest.mocked(rockGet);

const EDITOR = { rolesMap: { editor: ['7001'] }, access: { runsheetCampuses: ['MNL'] } } as any;
const VIEWER = { rolesMap: { viewer: ['7001'] }, access: { runsheetCampuses: ['MNL'] } } as any;
/** An editor scoped to another campus entirely. */
const BNE_EDITOR = { rolesMap: { editor: ['7002'] }, access: { runsheetCampuses: ['BNE'] } } as any;
/** A Grow Course Head: an editor, but only of Grow runsheets. */
const GROW_HEAD = { rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [] } } as any;

/** A date comfortably in the future so the past-date guard never fires. */
const FUTURE = 'MNL Crowne // December 27, 2099 // 3PM';
const PAST = 'MNL Crowne // September 27, 2020 // 3PM';

describe('rockSyncRosterRole', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSession.mockResolvedValue(EDITOR);
  });

  it('refuses a viewer', async () => {
    mockSession.mockResolvedValueOnce(VIEWER);
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(mockRockPut).not.toHaveBeenCalled();
    // Denied at the gate, before any Rock lookup happens.
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('refuses an editor scoped to another campus', async () => {
    mockSession.mockResolvedValueOnce(BNE_EDITOR);
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(mockRockPut).not.toHaveBeenCalled();
    // Denied at the gate, before any Rock lookup happens.
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('refuses a Grow Course Head writing a Sunday service roster', async () => {
    mockSession.mockResolvedValueOnce(GROW_HEAD);
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(mockRockPut).not.toHaveBeenCalled();
    // The gate itself reads /Schedules to test the title against Grow
    // Courses; what must never happen is the roster lookup that precedes a
    // write.
    expect(mockRockGet).not.toHaveBeenCalledWith('/GroupLocations', expect.anything());
  });

  it('refuses a runsheet whose date has passed', async () => {
    const res = await rockSyncRosterRole({
      channelName: PAST,
      roleTitle: 'Roster: Service Director',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('This runsheet is in the past, so its roster can no longer be changed.');
    expect(mockRockPut).not.toHaveBeenCalled();
  });

  it('refuses an unmapped role', async () => {
    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Coffee Captain',
      personIds: [10],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('This role is not linked to Rock.');
    expect(mockRockPut).not.toHaveBeenCalled();
  });

  it('refuses a role Rock does not schedule for this service', async () => {
    // The runsheet is a Family Night (schedule 35), which the Service Director's
    // team carries but Security (19144, location 748) does not.
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 35, Name: 'MNL Family Night' }] },
      ] as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([
        { GroupId: 19144, LocationId: 748, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any); // 19144

    const res = await rockSyncRosterRole({
      channelName: 'MNL Family Night // December 27, 2099 // 7PM',
      roleTitle: 'Roster: Security Lead',
      personIds: [10],
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Rock does not schedule this role for this service.');
    expect(mockRockPut).not.toHaveBeenCalled();
    expect(jest.mocked(rockPost)).not.toHaveBeenCalled();
  });

  it('writes nothing when more people are assigned than the role has slots', async () => {
    // Five group-locations reads, 1 occurrences read, 1 attendances read; then the plan rejects.
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10, 20],
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Rock only has 1 slot for this role, but 2 people were assigned.');
    expect(mockRockPut).not.toHaveBeenCalled();
    expect(jest.mocked(rockPost)).not.toHaveBeenCalled();
  });

  it('never reads back with an empty filter when Rock has no occurrence rows', async () => {
    // Clearing a role that Rock has never opened a slot for: nothing to add and
    // nothing to remove. An unguarded read-back would send `$filter=` and pull
    // every Attendance in Rock back into the picker.
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      // occurrenceRows: Rock has no slot open for this role/date yet
      .mockResolvedValueOnce([] as any);

    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [],
    });

    expect(res.success).toBe(true);
    expect(res.people).toEqual([]);
    expect(mockRockPut).not.toHaveBeenCalled();
    expect(mockRockGet).not.toHaveBeenCalledWith(
      '/Attendances',
      expect.objectContaining({ $filter: '' }),
      expect.anything(),
    );
  });

  it('performs removes first then adds and returns updated people', async () => {
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      // occurrenceRows
      .mockResolvedValueOnce([{ Id: 100, LocationId: 475 }] as any)
      // current attendances: personId 10 currently assigned
      .mockResolvedValueOnce([
        {
          Id: 55,
          OccurrenceId: 100,
          RSVP: 2,
          PersonAlias: { PersonId: 10, Person: { NickName: 'Old', LastName: 'Person' } },
        },
      ] as any)
      // read-back attendances: personId 20 now assigned
      .mockResolvedValueOnce([
        {
          Id: 56,
          OccurrenceId: 100,
          RSVP: 2,
          PersonAlias: { PersonId: 20, Person: { NickName: 'New', LastName: 'Volunteer' } },
        },
      ] as any);

    mockRockPut.mockResolvedValue({} as any);

    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [20],
    });

    expect(res.success).toBe(true);
    expect(res.people).toEqual([{ personId: 20, name: 'New Volunteer' }]);
    expect(mockRockPut).toHaveBeenCalledWith('/Attendances/ScheduledPersonRemove', { attendanceId: 55 });
    expect(mockRockPut).toHaveBeenCalledWith('/Attendances/ScheduledPersonAddConfirmed', {
      personId: 20,
      attendanceOccurrenceId: 100,
    });
  });
});
