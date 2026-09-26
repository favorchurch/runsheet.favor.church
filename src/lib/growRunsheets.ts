/**
 * Grow Course runsheets: one runsheet per occurrence of each schedule in
 * Rock's "Grow Courses" schedule category. The title is the only link
 * between a runsheet and its schedule/date (Rock returns no categories for
 * runsheet channels), so building and matching titles live together here.
 */
import { extractRunsheetCampus } from './runsheetCampus';
import { extractChannelDate } from './runsheetDate';
import { expandIcalOccurrences, type ScheduleOccurrence } from './scheduleOccurrences';

export const GROW_SCHEDULE_CATEGORY_ID = 483;
export const GROW_CONTENT_CHANNEL_CATEGORY_ID = 338;
export const GROW_TEAM_GROUP_ID = 19108;
export const GROW_EDITOR_ROLE_NAMES = ['overall head', 'unit head'];
export const GROW_SYNC_CAP = 50;

export interface GrowSchedule {
  id: number;
  name: string;
  iCalendarContent: string;
  effectiveEndDate?: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatWordyDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function titlePrefix(scheduleName: string): string {
  const name = scheduleName.trim();
  return extractRunsheetCampus(name) ? name : `MNL ${name}`;
}

export function buildGrowRunsheetTitle(scheduleName: string, isoDate: string, time: string): string {
  return `${titlePrefix(scheduleName)} // ${formatWordyDate(isoDate)} // ${time}`;
}

export function growOccurrenceKey(scheduleId: number, isoDate: string): string {
  return `${scheduleId}:${isoDate}`;
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function matchGrowRunsheet(
  title: string,
  schedules: GrowSchedule[],
): { scheduleId: number; date: string } | null {
  const parts = (title || '').split('//').map((p) => p.trim());
  if (parts.length < 2) return null;
  const date = extractChannelDate(parts[1]);
  if (!date) return null;

  const prefix = normalize(parts[0]);
  const matches = schedules.filter((s) => normalize(titlePrefix(s.name)) === prefix);
  if (matches.length !== 1) return null;
  return { scheduleId: matches[0].id, date: toIsoLocal(date) };
}

export function nextGrowOccurrence(schedule: GrowSchedule, today: string): ScheduleOccurrence | null {
  return expandIcalOccurrences(schedule.iCalendarContent, today, schedule.effectiveEndDate, 1)[0] ?? null;
}

export function planMissingGrowRunsheets(
  schedules: GrowSchedule[],
  existingTitles: string[],
  today: string,
  cap = GROW_SYNC_CAP,
): string[] {
  const existingKeys = new Set(
    existingTitles
      .map((t) => matchGrowRunsheet(t, schedules))
      .filter((m): m is { scheduleId: number; date: string } => m !== null)
      .map((m) => growOccurrenceKey(m.scheduleId, m.date)),
  );

  const titles: string[] = [];
  for (const schedule of schedules) {
    for (const occ of expandIcalOccurrences(schedule.iCalendarContent, today, schedule.effectiveEndDate)) {
      if (titles.length >= cap) return titles;
      const key = growOccurrenceKey(schedule.id, occ.date);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      titles.push(buildGrowRunsheetTitle(schedule.name, occ.date, occ.time));
    }
  }
  return titles;
}
