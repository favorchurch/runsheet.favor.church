import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPost, rockPut } from '@/server-actions/internal/rockFetch';
import { clearRosterScheduleMapCache } from '@/server-actions/internal/rockRosterQueries';
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
    // The group/schedule map is cached per process; without this a test
    // inherits the previous test's Rock fixtures.
    clearRosterScheduleMapCache();
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

  it('schedules both people when a one-slot role is given two, since Rock allows it', async () => {
    jest.mocked(rockGet)
      .mockResolvedValueOnce([
        { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
      ] as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([] as any) // 19144
      // current occupants: none
      .mockResolvedValueOnce([] as any) // occurrences
      // occurrenceIdByLocation
      .mockResolvedValueOnce([{ Id: 100, LocationId: 475 }] as any)
      // read-back: both now in the role, sharing the one slot
      .mockResolvedValueOnce([{ Id: 100, GroupId: 19100, LocationId: 475 }] as any)
      .mockResolvedValueOnce([
        { Id: 61, OccurrenceId: 100, RSVP: 1, PersonAliasId: 5010 },
        { Id: 62, OccurrenceId: 100, RSVP: 1, PersonAliasId: 5020 },
      ] as any)
      .mockResolvedValueOnce([
        { Id: 5010, PersonId: 10 },
        { Id: 5020, PersonId: 20 },
      ] as any)
      .mockResolvedValueOnce([
        { Id: 10, NickName: 'First', LastName: 'Director' },
        { Id: 20, NickName: 'Second', LastName: 'Director' },
      ] as any);

    mockRockPut.mockResolvedValue({} as any);

    const res = await rockSyncRosterRole({
      channelName: FUTURE,
      roleTitle: 'Roster: Service Director',
      personIds: [10, 20],
    });

    expect(res.success).toBe(true);
    expect(res.people).toEqual([
      { personId: 10, name: 'First Director' },
      { personId: 20, name: 'Second Director' },
    ]);
    expect(mockRockPut).toHaveBeenCalledWith('/Attendances/ScheduledPersonAddConfirmed', {
      personId: 10,
      attendanceOccurrenceId: 100,
    });
    expect(mockRockPut).toHaveBeenCalledWith('/Attendances/ScheduledPersonAddConfirmed', {
      personId: 20,
      attendanceOccurrenceId: 100,
    });
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
    const groupLocations = [
      { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
    ];
    jest.mocked(rockGet)
      .mockResolvedValueOnce(groupLocations as any) // 19100
      .mockResolvedValueOnce([] as any) // 19109
      .mockResolvedValueOnce([] as any) // 19095
      .mockResolvedValueOnce([] as any) // 19096
      .mockResolvedValueOnce([] as any) // 19144
      // --- current occupants, via fetchRosterOccupants ---
      .mockResolvedValueOnce([{ Id: 100, GroupId: 19100, LocationId: 475 }] as any) // occurrences
      // RSVP 1 = Yes (confirmed). personId 10 currently holds the role.
      .mockResolvedValueOnce([{ Id: 55, OccurrenceId: 100, RSVP: 1, PersonAliasId: 5010 }] as any)
      .mockResolvedValueOnce([{ Id: 5010, PersonId: 10 }] as any)
      .mockResolvedValueOnce([{ Id: 10, NickName: 'Old', LastName: 'Person' }] as any)
      // --- occurrenceIdByLocation, for the add ---
      .mockResolvedValueOnce([{ Id: 100, LocationId: 475 }] as any)
      // --- read-back after the write: personId 20 now holds it ---
      .mockResolvedValueOnce([{ Id: 100, GroupId: 19100, LocationId: 475 }] as any)
      .mockResolvedValueOnce([{ Id: 56, OccurrenceId: 100, RSVP: 1, PersonAliasId: 5020 }] as any)
      .mockResolvedValueOnce([{ Id: 5020, PersonId: 20 }] as any)
      .mockResolvedValueOnce([{ Id: 20, NickName: 'New', LastName: 'Volunteer' }] as any);

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
