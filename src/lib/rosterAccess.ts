/**
 * Rostered-only runsheet view. A volunteer's Group Scheduler attendances
 * become `<campus>:<YYYY-MM-DD>:<HH:MM:SS>` keys; a runsheet is visible to
 * them when its title yields the same key. The key has no venue, so every
 * same-campus runsheet in that date/time slot matches.
 */
import { extractRunsheetCampus, type RunsheetCampusCode } from './runsheetCampus';
import { extractChannelDate, extractChannelTime, parseTimeToSortSignature } from './runsheetDate';
import { getRunsheetKind } from './runsheetKind';

/** Rock Campus.Id → runsheet campus code (verified 2026-09-26). */
export const ROCK_CAMPUS_CODES: Record<number, RunsheetCampusCode> = { 1: 'MNL', 2: 'BNE', 3: 'SEL' };

export interface RosteredAttendance {
  campusId: number | null;
  startDateTime: string;
  scheduleId: number | null;
}

export function rosterKey(campus: RunsheetCampusCode, isoDate: string, timeSignature: string): string {
  return `${campus}:${isoDate}:${timeSignature}`;
}

export function buildRosteredViewerKeys(
  attendances: RosteredAttendance[],
  growScheduleIds: ReadonlySet<number>,
): string[] {
  const keys = new Set<string>();
  for (const a of attendances) {
    // Grow sessions have their own access (growViewer); a Sunday 3PM Grow
    // class must not unlock the Sunday 3PM service runsheet.
    if (a.scheduleId !== null && growScheduleIds.has(a.scheduleId)) continue;
    const campus = a.campusId !== null ? ROCK_CAMPUS_CODES[a.campusId] : undefined;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):?(\d{2})?/.exec(a.startDateTime || '');
    if (!campus || !m) continue;
    keys.add(rosterKey(campus, m[1], `${m[2]}:${m[3] || '00'}`));
  }
  return [...keys];
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function channelRosterKey(channelName: string): string | null {
  if (!channelName || getRunsheetKind(channelName) === 'grow') return null;
  const campus = extractRunsheetCampus(channelName);
  const date = extractChannelDate(channelName);
  const time = parseTimeToSortSignature(extractChannelTime(channelName));
  if (!campus || !date || !time) return null;
  return rosterKey(campus, toIsoLocal(date), time);
}
