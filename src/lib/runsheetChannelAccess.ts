/**
 * Per-channel runsheet access: blanket campus rules first, then Grow Course rules, then rostered-only matching (lib/rosterAccess).
 */
import type { AuthRolesMap } from '@/types/AuthUser';
import { canAccessRunsheetChannel } from './runsheetCampus';
import { growOccurrenceKey, matchGrowRunsheet, type GrowSchedule } from './growRunsheets';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE, ROSTERED_VIEWER_ROLE } from './permissions';
import { channelRosterKey } from './rosterAccess';
import { getRunsheetKind, isGrowRunsheetTitle } from './runsheetKind';

export type ChannelAccessSession = {
  rolesMap?: AuthRolesMap;
  access?: { runsheetCampuses?: string[]; runsheetEditCampuses?: string[] };
} | null | undefined;

const has = (s: ChannelAccessSession, role: string) => Boolean(s?.rolesMap?.[role]?.length);

/**
 * Campuses the session may edit. View-only campuses (Events Team members,
 * Deaf Ministry heads, Department Admins) never widen this. Sessions cached
 * before the split carry only `runsheetCampuses`.
 */
export function runsheetEditCampuses(session: ChannelAccessSession): string[] {
  return session?.access?.runsheetEditCampuses ?? session?.access?.runsheetCampuses ?? [];
}

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
  if (has(session, 'editor') && canAccessRunsheetChannel(runsheetEditCampuses(session), channelName)) {
    return true;
  }
  return has(session, GROW_EDITOR_ROLE) && matchGrowRunsheet(channelName, growSchedules) !== null;
}

/**
 * Client-side hint for whether the open runsheet is editable, so a user who
 * edits one campus but only views another does not get edit controls there.
 * The server's `assertRunsheetEditAccess` remains the authority (it matches
 * Grow titles against live schedules; here a Grow-looking title suffices).
 */
export function canEditRunsheetTitle(session: ChannelAccessSession, channelName: string): boolean {
  if (has(session, 'editor') && canAccessRunsheetChannel(runsheetEditCampuses(session), channelName)) {
    return true;
  }
  return has(session, GROW_EDITOR_ROLE) && isGrowRunsheetTitle(channelName);
}
