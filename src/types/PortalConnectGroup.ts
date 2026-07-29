import { CAMPUS_NAME_BY_ID, normalizeCapacityValue, splitDelimitedValues } from '@/util-connect/connectGroupAttributes';
import { rockFormatSubtitle } from '@/util-rock/utilFormatSubtitle';
import { rockGetConnectRoleFromGroupRoleId } from '@/util-rock/utilGetConnectRoleFromGroupRoleId';
import { ConnectRole } from './ConnectRole';
import { RockConnectGroupData, RockGroup, getConnectGroupData } from './RockGroup';
import { RockGroupMember, RockGroupMemberStatus } from './RockGroupMember';
import { parseRockSchedule } from './RockSchedule';
import { portalStringId } from './portalStringId';
import { PortalCampus, getPortalCampuses } from './PortalCampus';
import { PortalContact, normalizePortalContact } from './PortalContact';

export interface PortalGroupAssignment {
  _id?: string;
  title?: string;
  contacts?: PortalContact[];
  roles?: string[];
  policies?: string[];
  reporter?: boolean;
  visible?: boolean;
  shareDetails?: boolean;
}

export interface PortalConnectGroupData {
  isNew?: boolean;
  campus?: string;
  capacity?: string;
  minAge?: number;
  maxAge?: number;
  locality?: string;
  landmark?: string;
  meetupDay?:
    | 'Sunday'
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday';
  meetupTime?: string;
  groupTypes?: string[];
  groupTypesCouples?: string[];
  ageGroup?: string;
  youthHighSchoolLevel?: string;
  youthGradeLevel?: string | string[];
  youngAdultsIsForCampus?: string;
  youngAdultsWhichCampus?: string;
  identifiersSpecial?: string[];
  collectingMembers?: boolean;
}

export interface PortalConnectGroup extends RockGroup {
  _id?: string;
  title?: string;
  firstLine?: string;
  created?: string;
  updated?: string;
  status?: 'active' | 'draft' | 'archived' | 'deleted';
  campuses?: PortalCampus[];
  allowProvisional?: boolean;
  provisionalMembers?: PortalContact[];
  assignments?: PortalGroupAssignment[];
  regionalLeaders?: PortalContact[];
  clusterHeads?: PortalContact[];
  // Nearest Region/Cluster section ids + raw names, surfaced from the Rock
  // hierarchy (see rockGetScopedGroupHierarchy). Used to group rows into
  // collapsible sections in the hierarchical AttendanceRateTable.
  regionId?: number;
  regionName?: string;
  clusterId?: number;
  clusterName?: string;
  data?: PortalConnectGroupData;
}

const roleTitleMap: Record<ConnectRole, string> = {
  [ConnectRole.ConnectLeader]: 'Connect Leader',
  [ConnectRole.RegionalLeader]: 'Regional Leader',
  [ConnectRole.ClusterHead]: 'Cluster Head',
  [ConnectRole.ConnectMember]: 'Member',
  [ConnectRole.ConnectLink]: 'Connect Link',
  [ConnectRole.AssistantLeader]: 'Assistant Leader',
  [ConnectRole.Admin]: 'Admin',
  [ConnectRole.DepartmentHead]: 'Department Head',
};

function toStringArray(value?: string | string[] | null): string[] {
  return splitDelimitedValues(value);
}

function getPortalStatus(group?: Pick<RockGroup, 'IsArchived' | 'ArchivedDateTime' | 'IsActive'>): PortalConnectGroup['status'] {
  if (group?.IsArchived || group?.ArchivedDateTime) return 'archived';
  if (group?.IsActive === false) return 'draft';
  return 'active';
}

function normalizePortalConnectGroupData(
  data?: RockConnectGroupData,
  group?: Pick<RockGroup, 'CampusId' | 'GroupCapacity' | 'Schedule'>
): PortalConnectGroupData | undefined {
  const schedule = parseRockSchedule(group?.Schedule);
  if (!data && !group?.CampusId && group?.GroupCapacity === undefined && !schedule.meetupDay && !schedule.meetupTime) {
    return undefined;
  }
  const result: PortalConnectGroupData = {
    campus: group?.CampusId ? CAMPUS_NAME_BY_ID[group.CampusId] : undefined,
    capacity: normalizeCapacityValue(group?.GroupCapacity ?? data?.capacity),
    minAge: data?.minAge,
    maxAge: data?.maxAge,
    locality: data?.locality,
    landmark: data?.landmark,
    meetupDay: (data?.meetupDay || schedule.meetupDay) as PortalConnectGroupData['meetupDay'],
    meetupTime: data?.meetupTime || schedule.meetupTime,
    groupTypes: toStringArray(data?.groupTypes),
    groupTypesCouples: toStringArray(data?.groupTypesCouples),
    ageGroup: data?.ageGroup,
    youthHighSchoolLevel: data?.youthHighSchoolLevel,
    youthGradeLevel: data?.youthGradeLevel,
    youngAdultsIsForCampus: data?.youngAdultsIsForCampus,
    youngAdultsWhichCampus: data?.youngAdultsWhichCampus,
    identifiersSpecial: toStringArray(data?.identifiersSpecial),
    collectingMembers: data?.collectingMembers,
  };
  return result;
}

export function formatPortalConnectGroupSubtitle(group: PortalConnectGroup): string {
  const data: RockConnectGroupData | undefined = group.data
    ? {
        capacity: group.data.capacity ? Number(group.data.capacity) : undefined,
        minAge: group.data.minAge,
        maxAge: group.data.maxAge,
        locality: group.data.locality,
        landmark: group.data.landmark,
        meetupDay: group.data.meetupDay,
        meetupTime: group.data.meetupTime,
        ageGroup: group.data.ageGroup,
        youthHighSchoolLevel: group.data.youthHighSchoolLevel,
        youthGradeLevel: Array.isArray(group.data.youthGradeLevel)
          ? group.data.youthGradeLevel.join(', ')
          : group.data.youthGradeLevel,
        youngAdultsIsForCampus: group.data.youngAdultsIsForCampus,
        youngAdultsWhichCampus: group.data.youngAdultsWhichCampus,
        groupTypes: group.data.groupTypes?.join(', '),
        groupTypesCouples: group.data.groupTypesCouples?.join(', '),
        identifiersSpecial: group.data.identifiersSpecial?.join(', '),
      }
    : undefined;
  return rockFormatSubtitle(group, data);
}

function normalizePortalAssignments(members?: RockGroupMember[] | null): PortalGroupAssignment[] {
  if (!members?.length) return [];

  const byRole = new Map<ConnectRole, PortalGroupAssignment>();

  for (const member of members) {
    if (member.GroupMemberStatus !== RockGroupMemberStatus.Active || !member.Person) continue;
    const role = rockGetConnectRoleFromGroupRoleId(member.GroupRoleId) || ConnectRole.ConnectMember;
    const current = byRole.get(role) || {
      _id: `role-${role}`,
      title: roleTitleMap[role],
      contacts: [],
      roles: [String(member.GroupRoleId)],
      policies: [],
      reporter: role === ConnectRole.ConnectLeader,
      visible: true,
      shareDetails: false,
    };
    current.contacts = [...(current.contacts || []), normalizePortalContact(member.Person)];
    byRole.set(role, current);
  }

  return Array.from(byRole.values());
}

export function normalizePortalConnectGroup(group: RockGroup): PortalConnectGroup {
  const data = normalizePortalConnectGroupData(getConnectGroupData(group), group) || {};
  const provisionalMembers = (group.Members || [])
    .filter((member) => member.GroupMemberStatus === RockGroupMemberStatus.Active && member.Person)
    .map((member) => normalizePortalContact(member.Person));

  return {
    ...group,
    _id: portalStringId(group.Id),
    title: group.Name || '',
    firstLine: formatPortalConnectGroupSubtitle({
      ...group,
      data,
    } as PortalConnectGroup),
    created: group.CreatedDateTime || undefined,
    updated: group.ModifiedDateTime || group.CreatedDateTime || undefined,
    status: getPortalStatus(group),
    campuses: getPortalCampuses(group.CampusId),
    allowProvisional: true,
    provisionalMembers,
    assignments: normalizePortalAssignments(group.Members),
    data,
  };
}
