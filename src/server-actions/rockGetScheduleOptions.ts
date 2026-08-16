'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

export interface ScheduleOption {
  id: number;
  name: string;
  categoryId: number;
  timeLabel: string;
}

/**
 * Category mappings for schedule lookup in Rock RMS:
 * Category 302: Manila (Children: 311 Shang, 416 Podium, 417 Crowne, 418 Metrotent)
 * Category 303: Brisbane
 * Category 304: Seoul
 */
const CATEGORY_SCHEDULE_MAP: Record<number, number[]> = {
  // Category IDs from ContentChannels Category (e.g. 336 MNL Sunday Service -> 302/311/416/417)
  302: [302, 311, 416, 417, 418],
  336: [302, 311, 416, 417, 418],
  337: [302, 311, 416, 417, 418],
  338: [302, 311, 416, 417, 418],
  339: [302, 311, 416, 417, 418],
  340: [302, 311, 416, 417, 418],
  341: [302, 311, 416, 417, 418],
  // Brisbane categories
  303: [303],
  342: [303],
  344: [303],
  // Seoul categories
  304: [304],
  343: [304],
};

function formatScheduleTime(name: string): string {
  // Extract time pattern like 10AM, 11:30AM, 3PM, 4PM, 5:30PM, 9AM, 10:00 AM
  const timeMatch = name.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  if (timeMatch) {
    return timeMatch[1].toUpperCase();
  }
  return name;
}

export async function rockGetScheduleOptions(
  categoryId?: number,
  dateStr?: string
): Promise<{
  success: boolean;
  schedules: ScheduleOption[];
  error?: string;
}> {
  try {
    const session = await getRockSession();
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) return { success: false, schedules: [], error: access.error };

    const targetCategoryIds = categoryId && CATEGORY_SCHEDULE_MAP[categoryId]
      ? CATEGORY_SCHEDULE_MAP[categoryId]
      : [302, 311, 416, 417, 418, 303, 304];

    const filterClause = targetCategoryIds.map((id) => `CategoryId eq ${id}`).join(' or ');

    const rawSchedules = (await rockGet('/Schedules', {
      $filter: filterClause,
      $select: 'Id,Name,CategoryId,iCalendarContent,WeeklyDayOfWeek,EffectiveStartDate,EffectiveEndDate',
      $orderby: 'Name asc',
    })) as Array<{
      Id: number;
      Name: string;
      CategoryId: number;
      iCalendarContent?: string;
      WeeklyDayOfWeek?: number;
      EffectiveStartDate?: string;
      EffectiveEndDate?: string;
    }> | null;

    // 1. Exclude Kids services
    let list = (rawSchedules || []).filter(
      (s) => !s.Name.toLowerCase().includes('kids')
    );

    // 2. Youth Category vs Non-Youth Category filtering
    // Youth categories: 341 (MNL Youth), 344 (BNE Youth), or any categoryId mapped to youth
    const isYouthCategory = categoryId === 341 || categoryId === 344;

    list = list.filter((s) => {
      const nameLower = s.Name.toLowerCase();
      const isYouthSchedule = nameLower.includes('youth') || nameLower.includes('fy service') || nameLower.includes('fy');
      if (isYouthCategory) {
        return isYouthSchedule;
      } else {
        return !isYouthSchedule;
      }
    });

    // 3. Active Schedule Filtering by chosen Date range & recurrence rules
    if (dateStr) {
      // Midnight target date comparison
      const targetDate = new Date(`${dateStr}T00:00:00`);
      if (!isNaN(targetDate.getTime())) {
        const targetTime = targetDate.getTime();
        const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
        const dayMap: Record<number, string> = {
          0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
        };
        const dayCode = dayMap[dayOfWeek];

        list = list.filter((s) => {
          const ical = s.iCalendarContent || '';
          const icalUpper = ical.toUpperCase();
          const nameLower = s.Name.toLowerCase();

          // A. Parse Start Date
          let startDate: Date | null = s.EffectiveStartDate ? new Date(s.EffectiveStartDate) : null;
          const dtStartMatch = icalUpper.match(/DTSTART:(\d{4})(\d{2})(\d{2})/);
          if (dtStartMatch) {
            startDate = new Date(`${dtStartMatch[1]}-${dtStartMatch[2]}-${dtStartMatch[3]}T00:00:00`);
          }

          if (startDate && !isNaN(startDate.getTime())) {
            // Set to midnight
            const startTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
            if (targetTime < startTime) {
              // Target date is before schedule effective start date!
              return false;
            }
          }

          // B. Parse End Date / UNTIL Date
          let endDate: Date | null = s.EffectiveEndDate ? new Date(s.EffectiveEndDate) : null;
          const untilMatch = icalUpper.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
          if (untilMatch) {
            endDate = new Date(`${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}T23:59:59`);
          }

          if (endDate && !isNaN(endDate.getTime())) {
            const endTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59).getTime();
            if (targetTime > endTime) {
              // Target date is after schedule effective end date!
              return false;
            }
          }

          // C. One-time Event Check (No RRULE)
          const hasRrule = icalUpper.includes('RRULE:');
          if (!hasRrule && startDate && !isNaN(startDate.getTime())) {
            const sameDay =
              targetDate.getFullYear() === startDate.getFullYear() &&
              targetDate.getMonth() === startDate.getMonth() &&
              targetDate.getDate() === startDate.getDate();
            if (!sameDay) {
              // One-time event only occurs on its start date!
              return false;
            }
          }

          // D. Day of Week Verification
          let schedDay: string | null = null;
          if (icalUpper.includes('BYDAY=SU') || nameLower.includes('sunday')) schedDay = 'SU';
          else if (icalUpper.includes('BYDAY=SA') || nameLower.includes('saturday')) schedDay = 'SA';
          else if (icalUpper.includes('BYDAY=FR') || nameLower.includes('friday') || nameLower.includes('fy')) schedDay = 'FR';
          else if (icalUpper.includes('BYDAY=TH') || nameLower.includes('thursday')) schedDay = 'TH';
          else if (icalUpper.includes('BYDAY=WE') || nameLower.includes('wednesday')) schedDay = 'WE';
          else if (icalUpper.includes('BYDAY=TU') || nameLower.includes('tuesday')) schedDay = 'TU';
          else if (icalUpper.includes('BYDAY=MO') || nameLower.includes('monday')) schedDay = 'MO';

          if (schedDay) {
            return schedDay === dayCode;
          }

          if (dayOfWeek === 0) {
            return true;
          }
          return false;
        });
      }
    }

    const schedules: ScheduleOption[] = list.map((s) => ({
      id: s.Id,
      name: s.Name,
      categoryId: s.CategoryId,
      timeLabel: formatScheduleTime(s.Name),
    }));

    return {
      success: true,
      schedules,
    };
  } catch (err: any) {
    console.error('Error fetching schedule options from Rock:', err);
    return {
      success: false,
      schedules: [],
      error: 'Failed to fetch schedule options',
    };
  }
}
