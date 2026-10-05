/**
 * Rostered-only runsheet view. A volunteer's Group Scheduler attendances
 * become `<campus>:<YYYY-MM-DD>:<HH:MM:SS>` keys; a runsheet is visible to
 * them when its title yields the same key. The key has no venue, so every
 * same-campus runsheet in that date/time slot matches. Kids services run
 * alongside Sunday services, so Kids keys carry a `kids:` prefix and never
 * match a Sunday runsheet (or the other way round).
 */
import { extractRunsheetCampus, type RunsheetCampusCode } from './runsheetCampus';
import { extractChannelDate, extractChannelTime, parseTimeToSortSignature } from './runsheetDate';
import { getRunsheetKind } from './runsheetKind';

/** Rock Campus.Id → runsheet campus code (verified 2026-09-26). */
export const ROCK_CAMPUS_CODES: Record<number, RunsheetCampusCode> = { 1: 'MNL', 2: 'BNE', 3: 'SEL' };

/**
 * Rock overwrites an Attendance's StartDateTime with the check-in time and
 * clears its CampusId when a rostered volunteer checks in. The occurrence
 * keeps the real date and schedule, and the serving team keeps the campus,
 * so prefer those and fall back to the attendance row only when missing.
 */
export function rosteredAttendanceFromOccurrence(input: {
  attendanceCampusId: number | null;
  attendanceStartDateTime: string;
  occurrenceDate: string | null;
  scheduleId: number | null;
  scheduleStartTime: string | null;
  groupCampusId: number | null;
}): RosteredAttendance {
  const date = input.occurrenceDate ? input.occurrenceDate.slice(0, 10) : null;
  return {
    campusId: input.groupCampusId ?? input.attendanceCampusId,
    startDateTime:
      date && input.scheduleStartTime ? `${date}T${input.scheduleStartTime}` : input.attendanceStartDateTime,
    scheduleId: input.scheduleId,
  };
}

export interface RosteredAttendance {
  campusId: number | null;
  startDateTime: string;
  scheduleId: number | null;
}

export const KIDS_ROSTER_KEY_PREFIX = 'kids:';

export function rosterKey(campus: RunsheetCampusCode, isoDate: string, timeSignature: string): string {
  return `${campus}:${isoDate}:${timeSignature}`;
}

export function buildRosteredViewerKeys(
  attendances: RosteredAttendance[],
  growScheduleIds: ReadonlySet<number>,
  kidsScheduleIds: ReadonlySet<number> = new Set(),
): string[] {
  const keys = new Set<string>();
  for (const a of attendances) {
    // Grow sessions have their own access (growViewer); a Sunday 3PM Grow
    // class must not unlock the Sunday 3PM service runsheet.
    if (a.scheduleId !== null && growScheduleIds.has(a.scheduleId)) continue;
    const campus = a.campusId !== null ? ROCK_CAMPUS_CODES[a.campusId] : undefined;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):?(\d{2})?/.exec(a.startDateTime || '');
    if (!campus || !m) continue;
    const isKids = a.scheduleId !== null && kidsScheduleIds.has(a.scheduleId);
    keys.add(`${isKids ? KIDS_ROSTER_KEY_PREFIX : ''}${rosterKey(campus, m[1], `${m[2]}:${m[3] || '00'}`)}`);
  }
  return [...keys];
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function channelRosterKey(channelName: string): string | null {
  const kind = channelName ? getRunsheetKind(channelName) : null;
  if (!kind || kind === 'grow') return null;
  const campus = extractRunsheetCampus(channelName);
  const date = extractChannelDate(channelName);
  const time = parseTimeToSortSignature(extractChannelTime(channelName));
  if (!campus || !date || !time) return null;
  return `${kind === 'kids' ? KIDS_ROSTER_KEY_PREFIX : ''}${rosterKey(campus, toIsoLocal(date), time)}`;
}
