/**
 * Per-channel runsheet access: blanket campus rules first, then Grow Course rules, then rostered-only matching (lib/rosterAccess).
 */
import type { AuthRolesMap } from '@/types/AuthUser';
import { ALL_CAMPUSES, canAccessRunsheetChannel, scopeCampusCodes } from './runsheetCampus';
import { growOccurrenceKey, matchGrowRunsheet, type GrowSchedule } from './growRunsheets';
import { GROW_EDITOR_ROLE, GROW_VIEWER_ROLE, ROSTERED_VIEWER_ROLE } from './permissions';
import { ROCK_CAMPUS_CODES, channelRosterKey } from './rosterAccess';
import { getRunsheetKind, isGrowRunsheetTitle } from './runsheetKind';

export type ChannelAccessSession = {
  rolesMap?: AuthRolesMap;
  contact?: { campusId?: number | null };
  access?: { campusIds?: number[]; runsheetCampuses?: string[]; runsheetEditCampuses?: string[] };
} | null | undefined;

const has = (s: ChannelAccessSession, role: string) => Boolean(s?.rolesMap?.[role]?.length);

/**
 * Resolve the *identity* campus separately from granted roles. A cross-campus
 * roster or Ministry Team membership must not expand this boundary. The primary
 * Rock person's campus wins; an unknown primary campus fails closed. The
 * single-campus fallbacks support older sessions / scoped test fixtures, but
 * never infer home campus from several conflicting campus claims.
 */
export function runsheetIdentityCampusScope(session: ChannelAccessSession): string[] {
  if (session?.access?.runsheetCampuses?.includes(ALL_CAMPUSES)) return [ALL_CAMPUSES];

  const primaryCampus = session?.contact?.campusId;
  if (primaryCampus !== undefined) {
    const code = primaryCampus === null ? undefined : ROCK_CAMPUS_CODES[primaryCampus];
    return code ? [code] : [];
  }

  const campusIds = session?.access?.campusIds;
  if (campusIds?.length) {
    const codes = [...new Set(campusIds.map((id) => ROCK_CAMPUS_CODES[id]))];
    return codes.length === 1 && codes[0] ? [codes[0]] : [];
  }

  const scoped = scopeCampusCodes(session?.access?.runsheetCampuses);
  return scoped.length === 1 ? scoped : [];
}

/**
 * Authoritative view scope: identity campus first, then any role's view scope.
 * Roster-only and Grow roles are separately checked against this same boundary.
 */
export function runsheetViewCampusScope(session: ChannelAccessSession): string[] {
  const scope = session?.access?.runsheetCampuses || [];
  if (scope.includes(ALL_CAMPUSES)) return [ALL_CAMPUSES];
  const home = runsheetIdentityCampusScope(session);
  return home.length === 1 && scope.includes(home[0]) ? home : [];
}

/** Campuses the session may edit. Missing explicit edit scope fails closed. */
export function runsheetEditCampuses(session: ChannelAccessSession): string[] {
  const edits = session?.access?.runsheetEditCampuses || [];
  if (edits.includes(ALL_CAMPUSES) && session?.access?.runsheetCampuses?.includes(ALL_CAMPUSES)) return [ALL_CAMPUSES];
  const home = runsheetIdentityCampusScope(session);
  return home.length === 1 && edits.includes(home[0]) ? home : [];
}

export function canViewRunsheetChannel(
  session: ChannelAccessSession,
  channelName: string,
  growSchedules: GrowSchedule[],
): boolean {
  // A roster, Grow assignment or secondary campus role cannot cross home campus.
  if (!canAccessRunsheetChannel(runsheetIdentityCampusScope(session), channelName)) return false;

  if ((has(session, 'editor') || has(session, 'viewer')) &&
      canAccessRunsheetChannel(runsheetViewCampusScope(session), channelName)) {
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
  if (!canAccessRunsheetChannel(runsheetIdentityCampusScope(session), channelName)) return false;
  // An explicit edit scope is required; view rights alone never imply edits.
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
  if (!canAccessRunsheetChannel(runsheetIdentityCampusScope(session), channelName)) return false;
  if (has(session, 'editor') && canAccessRunsheetChannel(runsheetEditCampuses(session), channelName)) {
    return true;
  }
  return has(session, GROW_EDITOR_ROLE) && isGrowRunsheetTitle(channelName);
}
