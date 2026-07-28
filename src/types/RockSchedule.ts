/**
 * Rock Schedule type.
 * Used for event recurrence.
 *
 * Fluro uses EventTrack fields (autoRecur, recurCount, recurWeekday, etc.)
 * Rock uses Schedules with iCalendar content (RRULE format).
 *
 * A Schedule is linked to EventItemOccurrences via ScheduleId.
 * CRITICAL: EventItemOccurrences MUST have a ScheduleId for Attendance to work.
 */

import { normalizeMeetupTime } from '@/util-date/normalizeMeetupTime';

export interface RockSchedule {
  Id: number;
  Guid?: string;
  Name?: string;
  Description?: string | null;
  IsActive?: boolean;
  iCalendarContent?: string | null;
  CheckInStartOffsetMinutes?: number | null;
  CheckInEndOffsetMinutes?: number | null;
  EffectiveStartDate?: string | null;
  EffectiveEndDate?: string | null;
  WeeklyDayOfWeek?: number | null; // 0=Sunday, 1=Monday, ...
  WeeklyTimeOfDay?: string | null; // TimeSpan "19:00:00"
  CategoryId?: number | null;
  IsPublic?: boolean;
  AutoInactivateWhenComplete?: boolean;
  Order?: number;

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

export interface ParsedRockSchedule {
  meetupDay?: string;
  meetupTime?: string;
  intervalWeeks?: number;
}

/**
 * Helper to build iCalendar RRULE content for a weekly schedule.
 *
 * @param dayOfWeek - Day name ('Sunday', 'Monday', etc.)
 * @param time - 24h time string like '19:00'
 * @param intervalWeeks - 1 for weekly, 2 for biweekly
 */
export function buildWeeklyICalendar(
  dayOfWeek: string,
  time: string,
  intervalWeeks: number = 1
): string {
  const dayMap: Record<string, string> = {
    sunday: 'SU',
    monday: 'MO',
    tuesday: 'TU',
    wednesday: 'WE',
    thursday: 'TH',
    friday: 'FR',
    saturday: 'SA',
  };
  const rruleDay = dayMap[dayOfWeek.toLowerCase()] || 'SU';
  const normalizedTime = normalizeMeetupTime(time);
  if (!normalizedTime) {
    throw new Error(`Invalid meetup time: ${time}`);
  }
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    `DTSTART:20260101T${hh}${mm}00`,
    `RRULE:FREQ=WEEKLY;INTERVAL=${intervalWeeks};BYDAY=${rruleDay}`,
    'DTEND:20260101T' + String(hours + 1).padStart(2, '0') + `${mm}00`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

const RRULE_DAY_MAP: Record<string, string> = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
};

const WEEKLY_DAY_MAP: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function parseRockSchedule(schedule?: Pick<RockSchedule, 'iCalendarContent' | 'WeeklyDayOfWeek' | 'WeeklyTimeOfDay'> | null): ParsedRockSchedule {
  if (!schedule) return {};

  const parsed: ParsedRockSchedule = {};

  if (typeof schedule.WeeklyDayOfWeek === 'number') {
    parsed.meetupDay = WEEKLY_DAY_MAP[schedule.WeeklyDayOfWeek] || undefined;
  }

  const weeklyTime = normalizeMeetupTime(schedule.WeeklyTimeOfDay);
  if (weeklyTime) {
    parsed.meetupTime = weeklyTime;
  }

  const iCal = schedule.iCalendarContent || '';
  if (!iCal) return parsed;

  const intervalMatch = iCal.match(/RRULE:[^\r\n]*INTERVAL=(\d+)/i);
  const dayMatch = iCal.match(/RRULE:[^\r\n]*BYDAY=([A-Z]{2})/i);
  const startMatch = iCal.match(/DTSTART[:;][^\r\n]*T(\d{2})(\d{2})\d{2}/i);

  if (intervalMatch) {
    const interval = Number(intervalMatch[1]);
    if (Number.isFinite(interval) && interval > 0) {
      parsed.intervalWeeks = interval;
    }
  }

  if (!parsed.meetupDay && dayMatch) {
    parsed.meetupDay = RRULE_DAY_MAP[dayMatch[1].toUpperCase()] || undefined;
  }

  if (!parsed.meetupTime && startMatch) {
    parsed.meetupTime = normalizeMeetupTime(`${startMatch[1]}:${startMatch[2]}`);
  }

  return parsed;
}
