'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { getConnectWeekRange } from '@/util-date/getConnectWeekRange';
import { number, object, string } from 'zod';
import { rockGetAttendanceOccurrence } from './rockGetAttendanceOccurrence';
import { RockGroup, getConnectGroupData } from '@/types/RockGroup';
import { getTimezoneForCampus } from '@/providers/CampusContext/getTimezoneForCampus';
import { getNextMeetupUTC } from '@/util-date/getNextMeetupUTC';
import { pickCurrentConnectOccurrence } from '@/util-date/pickCurrentConnectOccurrence';
import { addDays } from 'date-fns';

const schema = object({
  groupId: number().int().positive(),
  beforeDate: string().optional(),
  afterDate: string().optional(),
});

/**
 * Get the most recent AttendanceOccurrence for a connect group within a date range.
 * Replaces EventItemOccurrence-based logic.
 */
export async function rockGetConnectEventDateFilter(
  groupId: number,
  beforeDate?: string,
  afterDate?: string,
  weeks: 1 | 2 = 2
): Promise<RockEventItemOccurrence | Record<string, never>> {
  await assertAuthenticated();
  schema.parse({ groupId, beforeDate, afterDate });

  // Default (no explicit navigation): land on the CURRENT connect week's meeting.
  const isDefaultRange = !beforeDate && !afterDate;
  if (isDefaultRange) {
    const range = getConnectWeekRange(new Date(), weeks);
    afterDate = range[0].toISOString();
    beforeDate = range[1].toISOString();
  }

  // Query AttendanceOccurrences with date filter
  const dateFilters: string[] = [`GroupId eq ${groupId}`];
  if (beforeDate) dateFilters.push(`OccurrenceDate lt datetime'${beforeDate.split('T')[0]}T00:00:00'`);
  if (afterDate) dateFilters.push(`OccurrenceDate ge datetime'${afterDate.split('T')[0]}T00:00:00'`);

  const mostRecentFirst = !!beforeDate && !afterDate;

  // On the default view the window can span 2-3 weeks, so a single ordinal sort
  // would return the oldest/newest edge rather than the current week's meeting.
  // Fetch the window and pick the occurrence nearest to now (see picker below).
  // Navigation (prev/next) keeps its single-direction, single-row behavior.
  const occurrences = (await rockGet('/AttendanceOccurrences', {
    $filter: dateFilters.join(' and '),
    $orderby: mostRecentFirst ? 'OccurrenceDate desc' : 'OccurrenceDate',
    $top: isDefaultRange ? 20 : 1,
  })) as any[];

  if (!occurrences.length) {
    // Attempt auto-creation if the group is active
    const group = (await rockGet(`/Groups/${groupId}`, {
      $select: 'Id,Name,CampusId,ScheduleId,IsActive',
      loadAttributes: 'True',
    })) as RockGroup;

    if (group.IsActive && group.ScheduleId) {
      const data = getConnectGroupData(group);
      if (data && data.meetupDay && data.meetupTime && group.CampusId) {
        const timezone = getTimezoneForCampus(group.CampusId);

        // Determine the start of the week we are querying
        const targetDate = afterDate ? new Date(afterDate) : new Date();
        const connectWeek = getConnectWeekRange(targetDate, weeks);

        const nextRecurDate = getNextMeetupUTC(
          addDays(connectWeek[0], 1).toISOString(),
          timezone,
          data.meetupDay as NonNullable<typeof data.meetupDay>,
          data.meetupTime
        );

        // Auto-create
        let newOccurrence;
        try {
          newOccurrence = await rockGetAttendanceOccurrence(groupId, nextRecurDate, group.ScheduleId);
        } catch (err) {
          console.error(
            `[rockGetConnectEventDateFilter] Auto-creation of occurrence failed for group ${groupId} on date ${nextRecurDate}:`,
            err
          );
          return {};
        }

        // Return mapped
        const mappedOccurrence: RockEventItemOccurrence & { DidNotOccur?: boolean } = {
          Id: newOccurrence.Id,
          EventItemId: 0,
          NextStartDateTime: newOccurrence.OccurrenceDate,
          Note: newOccurrence.Notes,
          DidNotOccur: false,
          ScheduleId: newOccurrence.ScheduleId,
          Schedule: undefined,
          Linkages: [{ GroupId: groupId }],
          stats: { checkin: 0 },
        } as any;

        return mappedOccurrence;
      }
    }


    return {};
  }

  const occurrence = isDefaultRange
    ? pickCurrentConnectOccurrence(occurrences, new Date()) ?? occurrences[0]
    : occurrences[0];

  // Map AttendanceOccurrence to RockEventItemOccurrence for compatibility
  const mappedOccurrence: RockEventItemOccurrence & { DidNotOccur?: boolean } = {
    Id: occurrence.Id,
    EventItemId: 0, // Not used in AttendanceOccurrence mode
    NextStartDateTime: occurrence.OccurrenceDate,
    Note: occurrence.Notes,
    DidNotOccur: occurrence.DidNotOccur,
    ScheduleId: occurrence.ScheduleId,
    Schedule: occurrence.Schedule,
    Linkages: [{ GroupId: groupId }],
  };

  const attendances: Array<{ Id: number }> = await rockGet('/Attendances', {
    $filter: `OccurrenceId eq ${occurrence.Id} and DidAttend eq true`,
    $select: 'Id',
    $top: 500,
  });

  (mappedOccurrence as any).stats = {
    checkin: attendances.length,
  };

  return mappedOccurrence;
}
