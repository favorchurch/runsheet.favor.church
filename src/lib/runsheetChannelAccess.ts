/**
 * Per-channel runsheet access. Campus rules (viewer/editor + campus scope)
 * are checked first and are unchanged; Grow rules only ever add access to
 * channels whose title matches a Grow Courses schedule.
 */
import type { AuthRolesMap } from '@/types/AuthUser';
import { canAccessRunsheetChannel } from './runsheetCampus';
import { growOccurrenceKey, matchGrowRunsheet, type GrowSchedule } from './growRunsheets';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE } from './permissions';

export type ChannelAccessSession = {
  rolesMap?: AuthRolesMap;
  access?: { runsheetCampuses?: string[] };
} | null | undefined;

const has = (s: ChannelAccessSession, role: string) => Boolean(s?.rolesMap?.[role]?.length);

export function canViewRunsheetChannel(
  session: ChannelAccessSession,
  channelName: string,
  growSchedules: GrowSchedule[],
): boolean {
  if ((has(session, 'editor') || has(session, 'viewer')) &&
      canAccessRunsheetChannel(session?.access?.runsheetCampuses, channelName)) {
    return true;
  }
  if (!has(session, GROW_EDITOR_ROLE) && !has(session, GROW_VIEWER_ROLE)) return false;

  const match = matchGrowRunsheet(channelName, growSchedules);
  if (!match) return false;
  if (has(session, GROW_EDITOR_ROLE)) return true;
  return (session?.rolesMap?.[GROW_VIEWER_ROLE] || []).includes(growOccurrenceKey(match.scheduleId, match.date));
}

export function canEditRunsheetChannel(
  session: ChannelAccessSession,
  channelName: string,
  growSchedules: GrowSchedule[],
): boolean {
  if (has(session, 'editor') && canAccessRunsheetChannel(session?.access?.runsheetCampuses, channelName)) {
    return true;
  }
  return has(session, GROW_EDITOR_ROLE) && matchGrowRunsheet(channelName, growSchedules) !== null;
}
