'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockSetConnectCollectingMembersValue } from '@/server-actions/internal/rockConnectGroupAttributes';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { buildWeeklyICalendar } from '@/types/RockSchedule';
import { getConnectWeekRange } from '@/util-date/getConnectWeekRange';
import { addDays } from 'date-fns';
import { revalidatePath, revalidateTag } from 'next/cache';
import { number, object, string } from 'zod';
import { rockGet, rockPost, rockPatch } from './internal/rockFetch';
import { serverLog } from '@/lib/serverLog';

const log = serverLog('rockCreateEventForConnect');

const schema = object({
  timezone: string().min(1, 'Timezone is required'),
  nextRecurDate: string().min(1, 'Next recur date is required'),
  groupId: number().int().positive(),
  groupName: string().min(1),
  campusId: number().int().positive(),
  meetupDay: string().min(1),
  meetupTime: string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'meetupTime must be HH:MM (24-hour)'),
});

interface CreateEventParams {
  groupId: number;
  groupName: string;
  campusId: number;
  meetupDay: string;
  meetupTime: string;
  timezone: string;
  nextRecurDate: string; // ISO date string
  meetEveryWeek?: boolean;
  intervalWeeks?: number;
  existingScheduleId?: number | null;
}

/**
 * Create or update an EventItem + Schedule + Occurrences for a connect group.
 * Replaces fluroCreateEventTrackForConnect.
 *
 * Rock model:
 * 1. Create a Schedule (iCalendar RRULE) for the meeting cadence
 * 2. Create an EventItem (the event template)
 * 3. Create EventItemOccurrences linked to the Schedule
 * 4. Create EventItemOccurrenceGroupMaps to link occurrences to the group
 */
export async function rockCreateEventForConnect(data: CreateEventParams): Promise<{
  eventItemId: number;
  scheduleId: number;
  occurrenceCount: number;
}> {
  await assertAuthenticated();
  const { groupId, groupName, campusId, meetupDay, meetupTime, nextRecurDate } = schema.parse(data);
  await assertAccessibleGroupId(groupId);

  const recurDate = new Date(nextRecurDate);
  const intervalWeeks =
    data.intervalWeeks && data.intervalWeeks > 0 ? data.intervalWeeks : data.meetEveryWeek ? 1 : 2;
  const intervalDays = intervalWeeks * 7;

  try {
    // Step 1: Check for existing EventItem linked to this group
    const existingMaps: any[] = await rockGet('/EventItemOccurrenceGroupMaps', {
      $filter: `GroupId eq ${groupId}`,
      $select: 'EventItemOccurrenceId',
      $top: 1,
    });

    let eventItemId: number;
    let scheduleId: number;

    if (existingMaps.length > 0) {
      // Get existing occurrence to find EventItem and Schedule
      const existingOcc: RockEventItemOccurrence = await rockGet(
        `/EventItemOccurrences/${existingMaps[0].EventItemOccurrenceId}`,
        { $select: 'EventItemId,ScheduleId' }
      );
      eventItemId = existingOcc.EventItemId;
      scheduleId = existingOcc.ScheduleId || 0;

      // Update schedule if it exists
      if (scheduleId) {
        const iCal = buildWeeklyICalendar(meetupDay, meetupTime, intervalWeeks);
        await rockPatch(`/Schedules/${scheduleId}`, {
          Name: '', // blank => inline/custom schedule; keeps it off Rock's shared /Schedules list
          iCalendarContent: iCal,
          IsActive: true,
        });
        log.debug('Updated schedule', scheduleId);
      }

      // Update EventItem name
      await rockPatch(`/EventItems/${eventItemId}`, {
        Name: groupName,
        IsActive: true,
      });
      log.debug('Updated EventItem', eventItemId);
    } else {
      scheduleId = data.existingScheduleId || 0;
      const iCal = buildWeeklyICalendar(meetupDay, meetupTime, intervalWeeks);
      if (scheduleId) {
        await rockPatch(`/Schedules/${scheduleId}`, {
          Name: '', // blank => inline/custom schedule; keeps it off Rock's shared /Schedules list
          iCalendarContent: iCal,
          IsActive: true,
        });
        log.debug('Updated standalone schedule', scheduleId);
      } else {
        scheduleId = await rockPost('/Schedules', {
          Name: '', // blank => inline/custom schedule; keeps it off Rock's shared /Schedules list
          iCalendarContent: iCal,
          IsActive: true,
        });
        log.debug('Created schedule', scheduleId);
      }

      // Create new EventItem
      eventItemId = await rockPost('/EventItems', {
        Name: groupName,
        IsActive: true,
        IsApproved: true,
      });
      log.debug('Created EventItem', eventItemId);
    }

    // Step 2: Get existing occurrences for this EventItem
    const existingOccs: RockEventItemOccurrence[] = await rockGet('/EventItemOccurrences', {
      $filter: `EventItemId eq ${eventItemId}`,
      $select: 'Id,NextStartDateTime',
      $orderby: 'NextStartDateTime',
    });

    const existingDates = new Set(
      existingOccs.map((o) => o.NextStartDateTime?.split('T')[0]).filter(Boolean)
    );

    // Step 3: Calculate needed occurrence dates
    const [, beforeDate] = getConnectWeekRange(new Date());
    const neededDates: Date[] = [];
    for (let i = 0; addDays(recurDate, intervalDays * i).getTime() < beforeDate.getTime(); i++) {
      const date = addDays(recurDate, intervalDays * i);
      const dateStr = date.toISOString().split('T')[0];
      if (!existingDates.has(dateStr)) {
        neededDates.push(date);
      }
    }

    // Step 4: Create missing occurrences
    let createdCount = 0;
    for (const date of neededDates) {
      try {
        // Parse time
        const [hours, minutes] = meetupTime.split(':').map(Number);
        const startDateTime = new Date(date);
        startDateTime.setHours(hours, minutes, 0, 0);

        const occurrenceId = await rockPost('/EventItemOccurrences', {
          EventItemId: eventItemId,
          CampusId: campusId,
          ScheduleId: scheduleId,
          NextStartDateTime: startDateTime.toISOString(),
        });
        log.debug('Created occurrence', occurrenceId, 'for', date.toISOString());

        // Create group map linkage
        await rockPost('/EventItemOccurrenceGroupMaps', {
          EventItemOccurrenceId: occurrenceId,
          GroupId: groupId,
        });

        createdCount++;
      } catch (err) {
        console.error('Error creating occurrence for date', date, err);
      }
    }

    // Also ensure existing occurrences have group maps
    for (const occ of existingOccs) {
      const existingGroupMaps: any[] = await rockGet('/EventItemOccurrenceGroupMaps', {
        $filter: `EventItemOccurrenceId eq ${occ.Id} and GroupId eq ${groupId}`,
        $top: 1,
      });
      if (existingGroupMaps.length === 0) {
        await rockPost('/EventItemOccurrenceGroupMaps', {
          EventItemOccurrenceId: occ.Id,
          GroupId: groupId,
        });
      }
    }

    await rockPatch(`/Groups/${groupId}`, {
      ScheduleId: scheduleId || null,
    });

    // Clear the collecting-members flag since group is now running events
    // Best-effort: don't fail event creation if attribute is not provisioned
    await rockSetConnectCollectingMembersValue(groupId, false);

    revalidateTag('rock:eventitems');
    revalidateTag('rock:eventitemoccurrences');
    revalidatePath('/connect', 'page');
    revalidatePath('/regional', 'page');
    revalidatePath('/cluster', 'page');
    revalidatePath('/department', 'page');

    return {
      eventItemId,
      scheduleId,
      occurrenceCount: existingOccs.length + createdCount,
    };
  } catch (err) {
    log.error('event creation failed', err);
    throw err;
  }
}
