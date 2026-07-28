import { getTimezoneForCampus } from '@/providers/CampusContext/getTimezoneForCampus';
import { RockEventItemOccurrence } from './RockEvent';
import { portalStringId } from './portalStringId';
import { PortalCampus, getPortalCampuses } from './PortalCampus';
import { PortalConnectGroup } from './PortalConnectGroup';

export interface PortalEventData {
  notes?: string;
  didNotOccur?: boolean;
}

export interface PortalEventStats {
  checkin?: number;
  guestExpected?: number;
}

export interface PortalEvent extends RockEventItemOccurrence {
  _id?: string;
  title?: string;
  firstLine?: string;
  created?: string;
  updated?: string;
  status?: 'active' | 'draft' | 'archived' | 'deleted';
  campuses?: PortalCampus[];
  startDate?: string;
  endDate?: string;
  expectTeams?: Array<string | PortalConnectGroup>;
  stats?: PortalEventStats;
  data?: PortalEventData;
  timezone?: string;
  track?: string;
  headcount?: {
    average?: number;
    combined?: number;
    reports?: number;
  };
}

export function normalizePortalEvent(
  event: RockEventItemOccurrence,
  options?: {
    groupsById?: Record<string, PortalConnectGroup>;
    fallbackGroup?: PortalConnectGroup;
    attendanceCount?: number;
  }
): PortalEvent {
  const groupIds = (event.Linkages || [])
    .map((linkage: any) => linkage?.GroupId)
    .filter(Boolean)
    .map((id: number) => String(id));
  const fallbackGroup = options?.fallbackGroup;
  const firstGroup = groupIds.length && options?.groupsById ? options.groupsById[groupIds[0]] : fallbackGroup;
  const startDate = event.NextStartDateTime || undefined;
  const timezone = firstGroup?.CampusId ? getTimezoneForCampus(firstGroup.CampusId) : undefined;
  const attendanceCount =
    options?.attendanceCount ??
    (event as RockEventItemOccurrence & { stats?: { checkin?: number } }).stats?.checkin ??
    0;

  return {
    ...event,
    _id: portalStringId(event.Id),
    title: (event as any).EventItem?.Name || (event as any).Event?.Name || firstGroup?.title || '',
    firstLine: firstGroup?.firstLine || '',
    created: event.CreatedDateTime || undefined,
    updated: event.ModifiedDateTime || event.CreatedDateTime || undefined,
    status: 'active',
    campuses: getPortalCampuses(event.CampusId ?? firstGroup?.CampusId),
    startDate,
    endDate: startDate,
    expectTeams: groupIds.length
      ? groupIds.map((groupId) => options?.groupsById?.[groupId] || groupId)
      : firstGroup
        ? [firstGroup]
        : [],
    stats: {
      checkin: attendanceCount,
    },
    data: {
      notes: (event as any).Notes || event.Note || undefined,
      didNotOccur: (event as any).DidNotOccur || false,
    },
    timezone,
    track: portalStringId(event.EventItemId),
    headcount: {
      average: attendanceCount,
      combined: attendanceCount,
      reports: attendanceCount ? 1 : 0,
    },
  };
}
