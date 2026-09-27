/**
 * Per-channel runsheet access: blanket campus rules first, then Grow Course rules, then rostered-only matching (lib/rosterAccess).
 */
import type { AuthRolesMap } from '@/types/AuthUser';
import { canAccessRunsheetChannel } from './runsheetCampus';
import { growOccurrenceKey, matchGrowRunsheet, type GrowSchedule } from './growRunsheets';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE, ROSTERED_VIEWER_ROLE } from './permissions';
import { channelRosterKey } from './rosterAccess';
import { getRunsheetKind } from './runsheetKind';

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

  const match = matchGrowRunsheet(channelName, growSchedules);
  if (match) {
    if (has(session, GROW_EDITOR_ROLE)) return true;
    return (session?.rolesMap?.[GROW_VIEWER_ROLE] || []).includes(growOccurrenceKey(match.scheduleId, match.date));
  }
  // A Grow-looking title that matches no known schedule fails closed.
  if (getRunsheetKind(channelName) === 'grow') return false;

  const key = channelRosterKey(channelName);
  return key !== null && (session?.rolesMap?.[ROSTERED_VIEWER_ROLE] || []).includes(key);
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
