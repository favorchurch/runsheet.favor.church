'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import {
  CAMPUS_ID_BY_NAME,
  capacityToRockValue,
  CONNECT_GROUP_ATTRIBUTE_KEYS,
  formatAgeRangeValue,
} from '@/connectGroupAttributes';
import { getTimezoneForCampus } from '@/providers/CampusContext/getTimezoneForCampus';
import {
  rockRequireConnectGroupAttributeDefinitions,
  rockUpsertGroupAttributeValue,
} from '@/server-actions/internal/rockConnectGroupAttributes';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { shouldConnectMeetEveryWeek } from '@/shouldConnectMeetEveryWeek';
import { RockGroup, getConnectGroupData } from '@/types/RockGroup';
import { buildWeeklyICalendar } from '@/types/RockSchedule';
import { getConnectWeekRange } from '@/util-date/getConnectWeekRange';
import { getNextMeetupUTC } from '@/util-date/getNextMeetupUTC';
import { addDays } from 'date-fns';
import { revalidateTag } from 'next/cache';
import { number, object, string } from 'zod';
import { rockGetAttendanceOccurrence } from './rockGetAttendanceOccurrence';

const schema = object({
  groupId: number().int().positive(),
  startDate: string().min(1),
});

interface SubtitleUpdateData {
  name?: string;
  campus?: string;
  meetupDay?: string;
  meetupTime?: string;
  locality?: string;
  landmark?: string;
  minAge?: number;
  maxAge?: number;
  ageGroup?: string;
  groupTypes?: string[] | string;
  groupTypesCouples?: string[] | string;
  identifiersSpecial?: string[] | string;
  youthHighSchoolLevel?: string;
  youthGradeLevel?: string;
  capacity?: string | number | null;
}

/**
 * Update a connect group's Group Type 25 subtitle attributes and keep the linked Rock schedule in sync.
 * Group.Description is intentionally not used for subtitle persistence.
 */
export async function rockPerformUpdateConnectSubtitle(
  groupId: number,
  updates: SubtitleUpdateData,
  startDate: string
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ groupId, startDate });
  await assertAccessibleGroupId(groupId);

  const currentGroup = (await rockGet(`/Groups/${groupId}`, {
    $select: 'Id,Name,CampusId,ScheduleId,GroupCapacity,CreatedDateTime',
    loadAttributes: 'True',
  })) as RockGroup;

  const definitions = await rockRequireConnectGroupAttributeDefinitions();
  const currentData = getConnectGroupData(currentGroup) || {};

  const nextName = updates.name ?? currentGroup.Name ?? '';
  const nextCampusId =
    updates.campus && updates.campus in CAMPUS_ID_BY_NAME
      ? CAMPUS_ID_BY_NAME[updates.campus as keyof typeof CAMPUS_ID_BY_NAME]
      : currentGroup.CampusId ?? undefined;
  const nextCapacity =
    updates.capacity !== undefined
      ? capacityToRockValue(updates.capacity)
      : currentGroup.GroupCapacity ?? null;

  const nextData = {
    ageGroup: updates.ageGroup ?? currentData.ageGroup,
    minAge: updates.minAge ?? currentData.minAge,
    maxAge: updates.maxAge ?? currentData.maxAge,
    locality: updates.locality ?? currentData.locality,
    landmark: updates.landmark ?? currentData.landmark,
    meetupDay: updates.meetupDay ?? currentData.meetupDay,
    meetupTime: updates.meetupTime ?? currentData.meetupTime,
    groupTypes: updates.groupTypes ?? currentData.groupTypes,
    groupTypesCouples: updates.groupTypesCouples ?? currentData.groupTypesCouples,
    identifiersSpecial: updates.identifiersSpecial ?? currentData.identifiersSpecial,
    youthHighSchoolLevel: updates.youthHighSchoolLevel ?? currentData.youthHighSchoolLevel,
    youthGradeLevel: updates.youthGradeLevel ?? currentData.youthGradeLevel,
  };

  const groupPatch: Record<string, unknown> = {};
  if (updates.name !== undefined && nextName !== currentGroup.Name) {
    groupPatch.Name = nextName;
  }
  if (updates.campus !== undefined && nextCampusId !== currentGroup.CampusId) {
    groupPatch.CampusId = nextCampusId;
  }
  if (updates.capacity !== undefined && nextCapacity !== currentGroup.GroupCapacity) {
    groupPatch.GroupCapacity = nextCapacity;
  }
  if (Object.keys(groupPatch).length) {
    await rockPatch(`/Groups/${groupId}`, groupPatch);
  }

  await Promise.all([
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.ageGroup].Id, nextData.ageGroup),
    rockUpsertGroupAttributeValue(
      groupId,
      definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.ageRange].Id,
      formatAgeRangeValue(nextData.minAge, nextData.maxAge)
    ),
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.locality].Id, nextData.locality),
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.landmark].Id, nextData.landmark),
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.meetupDay].Id, nextData.meetupDay),
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.meetupTime].Id, nextData.meetupTime),
    rockUpsertGroupAttributeValue(groupId, definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypes].Id, nextData.groupTypes),
    rockUpsertGroupAttributeValue(
      groupId,
      definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypesCouples].Id,
      nextData.groupTypesCouples
    ),
    rockUpsertGroupAttributeValue(
      groupId,
      definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.specialIdentifiers].Id,
      nextData.identifiersSpecial
    ),
    rockUpsertGroupAttributeValue(
      groupId,
      definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.youthHighSchoolLevel].Id,
      nextData.youthHighSchoolLevel
    ),
    rockUpsertGroupAttributeValue(
      groupId,
      definitions[CONNECT_GROUP_ATTRIBUTE_KEYS.youthGradeLevel].Id,
      nextData.youthGradeLevel
    ),
  ]);

  if (nextData.meetupDay && nextData.meetupTime && nextCampusId) {
    const intervalWeeks = shouldConnectMeetEveryWeek(currentGroup) ? 1 : 2;
    const iCalendarContent = buildWeeklyICalendar(nextData.meetupDay, nextData.meetupTime, intervalWeeks);
    // Blank name => inline/custom schedule; keeps it off Rock's shared /Schedules list.
    const scheduleName = '';
    let scheduleId = currentGroup.ScheduleId || undefined;

    if (scheduleId) {
      await rockPatch(`/Schedules/${scheduleId}`, {
        Name: scheduleName,
        iCalendarContent,
        IsActive: true,
      });
    } else {
      scheduleId = (await rockPost('/Schedules', {
        Name: scheduleName,
        iCalendarContent,
        IsActive: true,
      })) as number;

      await rockPatch(`/Groups/${groupId}`, {
        ScheduleId: scheduleId,
      });
    }

    const timezone = getTimezoneForCampus(nextCampusId);
    const connectWeek = getConnectWeekRange(new Date(startDate));
    const nextRecurDate = getNextMeetupUTC(
      addDays(connectWeek[0], 1).toISOString(),
      timezone,
      nextData.meetupDay as NonNullable<typeof nextData.meetupDay>,
      nextData.meetupTime
    );

    await rockGetAttendanceOccurrence(groupId, nextRecurDate, scheduleId);
  }

  revalidateTag('rock:groups');
  revalidateTag('rock:schedules');
  revalidateTag('rock:attendanceoccurrences');
}
