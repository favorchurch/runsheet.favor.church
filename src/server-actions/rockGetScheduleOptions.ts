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
  return timeMatch ? timeMatch[1].toUpperCase() : '';
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Whether a schedule has an occurrence on `isoDate` (YYYY-MM-DD). */
function occursOn(
  s: { Name: string; iCalendarContent?: string; EffectiveEndDate?: string },
  isoDate: string,
): boolean {
  if (s.iCalendarContent) {
    return expandIcalOccurrences(s.iCalendarContent, isoDate, s.EffectiveEndDate, 1)[0]?.date === isoDate;
  }
  // No calendar at all: fall back to a weekday in the name, else Sundays.
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const named = DAY_NAMES.findIndex((d) => s.Name.toLowerCase().includes(d));
  return named >= 0 ? named === day : day === 0;
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

    // 3. Keep the schedules that actually occur on the chosen date. Rock
    // stores both repeating rules (RRULE) and explicit date lists (RDATE);
    // expandIcalOccurrences reads both, so a course set up as "specific
    // dates" shows on every one of its dates, not just the first.
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const dateFilteredList = list.filter((s) => occursOn(s, dateStr));

      // If date-filtering produced 0 matches (e.g. form date was initialized to
      // Sunday, but Youth schedules occur on Saturday/Friday), keep the active
      // list so schedules remain selectable and can jump the form date via nextDate.
      if (dateFilteredList.length > 0) {
        list = dateFilteredList;
      }
    }

    const schedules: ScheduleOption[] = list.map((s) => {
      const occurrences = s.iCalendarContent
        ? expandIcalOccurrences(s.iCalendarContent, today, s.EffectiveEndDate)
        : [];
      const next = occurrences[0];
      const onDate = dateStr ? occurrences.find((o) => o.date === dateStr) : undefined;
      return {
        id: s.Id,
        name: s.Name,
        categoryId: s.CategoryId,
        // The schedule's own start time; names such as "MNL Tuesday Meeting"
        // carry none.
        timeLabel: onDate?.time || next?.time || formatScheduleTime(s.Name),
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
