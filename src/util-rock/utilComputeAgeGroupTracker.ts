import { ConnectAgeGroup } from '@/connectGroupAttributes';

export interface TrackerGroupInput {
  groupId: number;
  ageGroup: ConnectAgeGroup | null; // null = no/unrecognized age group
  isActive: boolean;
  collectingMembers?: boolean; // flag indicating group is actively collecting members (no events yet)
  memberPersonIds: number[]; // active members of THIS Connect group (connect leaders + members); NOT regional/cluster heads
}

export interface TrackerAttendance {
  groupId: number;
  personId: number;
}

export interface TrackerCounts {
  connectGroups: number;
  groupsMet: number;
  membersAttended: number;
  membersExpected: number;
  totalMembers: number;
  collectingMembers: number;
}

export interface TrackerRow extends TrackerCounts {
  ageGroup: ConnectAgeGroup;
}

export interface AgeGroupTrackerResult {
  rows: TrackerRow[];
  total: TrackerCounts;
  totalPeopleWithLeaders: number;
}

/** Age groups that get their own row, in display order. */
export const ROW_AGE_GROUPS: ConnectAgeGroup[] = ['Seasoned', 'Adults', 'Young Adults', 'Youth'];

export function computeAgeGroupTracker(
  groups: TrackerGroupInput[],
  attendances: TrackerAttendance[],
  leaderPersonIds: number[],
): AgeGroupTrackerResult {
  // Only include active groups that are NOT collecting members for stat calculations
  const activeGroups = groups.filter((g) => g.isActive && !g.collectingMembers);
  const activeGroupIds = new Set(activeGroups.map((g) => g.groupId));

  // attendees per active group
  const attendeesByGroup = new Map<number, Set<number>>();
  for (const a of attendances) {
    if (!activeGroupIds.has(a.groupId)) continue;
    let set = attendeesByGroup.get(a.groupId);
    if (!set) {
      set = new Set<number>();
      attendeesByGroup.set(a.groupId, set);
    }
    set.add(a.personId);
  }

  // People(G) = unique( members(G) ∪ attendees(G) )
  const peopleOf = (gs: TrackerGroupInput[]): Set<number> => {
    const s = new Set<number>();
    for (const g of gs) {
      for (const pid of g.memberPersonIds) s.add(pid);
      for (const pid of attendeesByGroup.get(g.groupId) ?? []) s.add(pid);
    }
    return s;
  };

  // Count collecting-members groups per age group (or null/unrecognized groups)
  const collectingMembersCountFor = (ageGroup: ConnectAgeGroup | null): number => {
    return groups.filter(
      (g) => g.collectingMembers && g.ageGroup === ageGroup,
    ).length;
  };

  const countsFor = (bucket: TrackerGroupInput[], ageGroup?: ConnectAgeGroup | null): TrackerCounts => {
    const metGroups = bucket.filter((g) => (attendeesByGroup.get(g.groupId)?.size ?? 0) > 0);
    const attendedSet = new Set<number>();
    for (const g of bucket) {
      for (const pid of attendeesByGroup.get(g.groupId) ?? []) attendedSet.add(pid);
    }
    return {
      connectGroups: bucket.length,
      groupsMet: metGroups.length,
      membersAttended: attendedSet.size,
      membersExpected: peopleOf(metGroups).size,
      totalMembers: peopleOf(bucket).size,
      collectingMembers: ageGroup !== undefined ? collectingMembersCountFor(ageGroup) : 0,
    };
  };

  const rows: TrackerRow[] = [];
  for (const ageGroup of ROW_AGE_GROUPS) {
    const bucket = activeGroups.filter((g) => g.ageGroup === ageGroup);
    if (bucket.length === 0) continue;
    rows.push({ ageGroup, ...countsFor(bucket, ageGroup) });
  }

  // For total, count all collecting-members groups across all age groups (that have recognized age groups)
  const totalCollectingMembers = groups.filter(
    (g) => g.collectingMembers && g.ageGroup !== null && ROW_AGE_GROUPS.includes(g.ageGroup),
  ).length;
  const total = countsFor(activeGroups);
  total.collectingMembers = totalCollectingMembers;

  const withLeaders = peopleOf(activeGroups);
  for (const pid of leaderPersonIds) withLeaders.add(pid);

  return { rows, total, totalPeopleWithLeaders: withLeaders.size };
}
