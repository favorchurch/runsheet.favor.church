'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID } from '@/lib/growRunsheets';
import { hasFullEditorRole } from '@/lib/permissions';
import { expandIcalOccurrences } from '@/lib/scheduleOccurrences';
import {
  descendantCategoryIds,
  isKidsCategoryName,
  KIDS_SERVICES_CATEGORY_ID,
  scheduleRootsForCategory,
  SCHEDULE_CATEGORY_ENTITY_TYPE_ID,
  YOUTH_SERVICES_CATEGORY_ID,
} from '@/lib/scheduleCategoryTree';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';

export interface ScheduleOccurrenceOption {
  date: string;
  time: string;
}

export interface ScheduleOption {
  id: number;
  name: string;
  categoryId: number;
  timeLabel: string;
  nextDate?: string;
  upcomingOccurrences?: ScheduleOccurrenceOption[];
}

function formatScheduleTime(name: string): string {
  // Extract time pattern like 10AM, 11:30AM, 3PM, 4PM, 5:30PM, 9AM, 10:00 AM
  const timeMatch = name.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  if (timeMatch) {
    return timeMatch[1].toUpperCase();
  }
  return name;
}

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
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

    // A Grow-only editor (Grow Course Head) creates Grow runsheets only, one
    // per Grow Courses topic occurrence; the form autofills the topic's next
    // date from `nextDate`. Full editors see the whole MNL | ALL EVENTS list,
    // Grow Courses included.
    if (categoryId === GROW_CONTENT_CHANNEL_CATEGORY_ID && !hasFullEditorRole(session)) {
      const today = manilaToday();
      const schedules: ScheduleOption[] = [];
      for (const s of await fetchGrowSchedules()) {
        const occurrences = expandIcalOccurrences(s.iCalendarContent, today, s.effectiveEndDate);
        const next = occurrences[0];
        if (!next) continue;
        schedules.push({
          id: s.id,
          name: s.name,
          categoryId: 483,
          timeLabel: next.time,
          nextDate: next.date,
          upcomingOccurrences: occurrences.map((o) => ({ date: o.date, time: o.time })),
        });
      }
      schedules.sort((a, b) => (a.nextDate || '').localeCompare(b.nextDate || ''));
      return { success: true, schedules };
    }

    const [categoryRows, contentCategory] = await Promise.all([
      rockGet('/Categories', {
        $filter: `EntityTypeId eq ${SCHEDULE_CATEGORY_ENTITY_TYPE_ID}`,
        $select: 'Id,ParentCategoryId',
        $top: 1000,
      }) as Promise<Array<{ Id: number; ParentCategoryId: number | null }> | null>,
      categoryId
        ? (rockGet(`/Categories/${categoryId}`) as Promise<{ Name?: string } | null>)
        : Promise.resolve(null),
    ]);

    const campus = contentCategory?.Name ? extractRunsheetCampus(contentCategory.Name.replace(/\|/g, ' ')) : null;
    const knownScheduleCategoryIds = new Set((categoryRows || []).map((c) => Number(c.Id)));
    const roots = scheduleRootsForCategory({
      campus,
      categoryName: contentCategory?.Name,
      categoryId,
      knownScheduleCategoryIds,
    });
    const targetCategoryIds = descendantCategoryIds(
      (categoryRows || []).map((c) => ({ id: Number(c.Id), parentId: c.ParentCategoryId ?? null })),
      roots,
    );

    const rawSchedules = (await rockGet('/Schedules', {
      $filter: `IsActive eq true and (${targetCategoryIds.map((id) => `CategoryId eq ${id}`).join(' or ')})`,
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

    const categoryTree = (categoryRows || []).map((c) => ({
      id: Number(c.Id),
      parentId: c.ParentCategoryId ?? null,
    }));

    // 1. Kids schedules belong to Kids categories only, and vice versa.
    const kidsCategoryIds = new Set(descendantCategoryIds(categoryTree, KIDS_SERVICES_CATEGORY_ID));
    const isKidsCategory =
      isKidsCategoryName(contentCategory?.Name) ||
      (categoryId != null && kidsCategoryIds.has(categoryId));
    let list = (rawSchedules || []).filter((s) => {
      const isKidsSchedule = s.Name.toLowerCase().includes('kids') || kidsCategoryIds.has(s.CategoryId);
      return isKidsCategory ? isKidsSchedule : !isKidsSchedule;
    });

    // 2. Youth Category vs Non-Youth Category filtering
    const youthCategoryIds = new Set(
      descendantCategoryIds(categoryTree, YOUTH_SERVICES_CATEGORY_ID)
    );
    const isYouthCategory =
      /youth/i.test(contentCategory?.Name || '') ||
      (categoryId != null && youthCategoryIds.has(categoryId)) ||
      targetCategoryIds.some((id) => youthCategoryIds.has(id));

    list = list.filter((s) => {
      const nameLower = s.Name.toLowerCase();
      const isYouthSchedule =
        nameLower.includes('youth') ||
        nameLower.includes('fy service') ||
        /\bfy\b/i.test(nameLower) ||
        youthCategoryIds.has(s.CategoryId);
      if (isYouthCategory) {
        return isYouthSchedule;
      } else {
        return !isYouthSchedule;
      }
    });

    // Only schedules that still have an occurrence from today onward.
    const today = manilaToday();
    list = list.filter(
      (s) => !s.iCalendarContent || expandIcalOccurrences(s.iCalendarContent, today, s.EffectiveEndDate, 1).length > 0,
    );

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

        const dateFilteredList = list.filter((s) => {
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
          else if (icalUpper.includes('BYDAY=FR') || nameLower.includes('friday') || /\bfy\b/i.test(nameLower)) schedDay = 'FR';
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

        // If date-filtering produced matches, keep them.
        // If it produced 0 matches (e.g. form date was initialized to Sunday, but
        // Youth schedules occur on Saturday/Friday), keep the active list so schedules
        // remain selectable and can jump the form date via nextDate.
        if (dateFilteredList.length > 0) {
          list = dateFilteredList;
        }
      }
    }

    const schedules: ScheduleOption[] = list.map((s) => {
      const occurrences = s.iCalendarContent
        ? expandIcalOccurrences(s.iCalendarContent, today, s.EffectiveEndDate)
        : [];
      const next = occurrences[0];
      return {
        id: s.Id,
        name: s.Name,
        categoryId: s.CategoryId,
        timeLabel: formatScheduleTime(s.Name),
        nextDate: next?.date,
        upcomingOccurrences: occurrences.map((o) => ({ date: o.date, time: o.time })),
      };
    });

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
