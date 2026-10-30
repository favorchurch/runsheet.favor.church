import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { rockGet } from '@/server-actions/internal/rockFetch';
import {
  clearRosterScheduleMapCache,
  fetchRosterOccupants,
  fetchRosterScheduleMap,
} from '@/server-actions/internal/rockRosterQueries';

jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockRockGet = jest.mocked(rockGet);

const GROUP_LOCATIONS = [
  { GroupId: 19100, LocationId: 475, Schedules: [{ Id: 565, Name: 'MNL Crowne 3PM' }] },
];

describe('fetchRosterScheduleMap', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearRosterScheduleMapCache();
    mockRockGet.mockResolvedValue([] as any);
    mockRockGet.mockResolvedValueOnce(GROUP_LOCATIONS as any);
  });

  it('asks Rock for four fields, not the whole schedule graph', async () => {
    await fetchRosterScheduleMap();

    // `$expand=Schedules,Location` returns 561KB for one group — mostly
    // iCalendar text — and this runs for five groups on every runsheet open.
    for (const call of mockRockGet.mock.calls) {
      const params = call[1] as any;
      expect(params.$select).toBe('GroupId,LocationId,Schedules/Id,Schedules/Name');
      expect(params.$expand).toBe('Schedules');
    }
  });

  it('builds the service list and the location to schedule index', async () => {
    const map = await fetchRosterScheduleMap();

    expect(map.services).toEqual([{ scheduleId: 565, name: 'MNL Crowne 3PM' }]);
    expect(map.scheduleIdsByLocation.get(475)).toEqual(new Set([565]));
  });

  it('caches, so opening a runsheet does not refetch the whole wiring', async () => {
    await fetchRosterScheduleMap();
    const callsAfterFirst = mockRockGet.mock.calls.length;
    expect(callsAfterFirst).toBe(5); // one per Group Scheduler team

    await fetchRosterScheduleMap();
    await fetchRosterScheduleMap();

    // Next serialises server actions, so an expensive roster read queues ahead
    // of the runsheet's own load and the editor waits under a spinner.
    expect(mockRockGet.mock.calls.length).toBe(callsAfterFirst);
  });

  it('refetches once the cache is cleared', async () => {
    await fetchRosterScheduleMap();
    clearRosterScheduleMapCache();
    mockRockGet.mockResolvedValueOnce(GROUP_LOCATIONS as any);

    await fetchRosterScheduleMap();

    expect(mockRockGet.mock.calls.length).toBe(10);
  });
});

describe('fetchRosterOccupants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('excludes unscheduled attendance rows and keeps requested attendances', async () => {
    mockRockGet
      .mockResolvedValueOnce([{ Id: 900, GroupId: 19100, LocationId: 475 }] as any) // /AttendanceOccurrences
      .mockResolvedValueOnce([
        {
          Id: 1,
          OccurrenceId: 900,
          RSVP: 3,
          RequestedToAttend: true,
          PersonAliasId: 5010,
        },
        {
          Id: 2,
          OccurrenceId: 900,
          RSVP: 3,
          RequestedToAttend: false,
          ScheduledToAttend: false,
          PersonAliasId: 5020,
        },
      ] as any) // /Attendances
      .mockResolvedValueOnce([
        { Id: 5010, PersonId: 10 },
        { Id: 5020, PersonId: 20 },
      ] as any) // /PersonAlias
      .mockResolvedValueOnce([
        { Id: 10, NickName: 'Scheduled', LastName: 'Volunteer' },
        { Id: 20, NickName: 'Unscheduled', LastName: 'Volunteer' },
      ] as any); // /People

    const occupants = await fetchRosterOccupants({
      scheduleId: 565,
      isoDate: '2026-09-27',
      locationIds: [475],
    });

    expect(occupants).toEqual([
      {
        attendanceId: 1,
        personId: 10,
        name: 'Scheduled Volunteer',
        locationId: 475,
        groupId: 19100,
      },
    ]);

    const attendanceCall = mockRockGet.mock.calls.find(([path]) => path === '/Attendances');
    expect(attendanceCall).toBeDefined();
    expect((attendanceCall?.[1] as any).$select).toContain('RequestedToAttend');
  });
});
