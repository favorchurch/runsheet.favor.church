import 'server-only';

import { canUserAccessRunsheet, canUserEditRunsheet, hasGrowRole } from '@/lib/permissions';
import type { GrowSchedule } from '@/lib/growRunsheets';
import { canEditRunsheetChannel, canViewRunsheetChannel } from '@/lib/runsheetChannelAccess';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
import { rockGet } from '@/server-actions/internal/rockFetch';
import type { AuthAccess, AuthRolesMap } from '@/types/AuthUser';

type RunsheetSession = {
  rolesMap?: AuthRolesMap;
  access?: Pick<AuthAccess, 'runsheetCampuses' | 'runsheetEditCampuses'>;
} | null | undefined;

export interface RunsheetAccessDecision {
  allowed: boolean;
  error?: string;
  channelName?: string;
  /**
   * The id names no runsheet this caller can see: deleted, not a runsheet, or
   * outside the caller's view scope. Deliberately indistinguishable.
   */
  notFound?: boolean;
}

const VIEW_DENIAL = 'You do not have access to runsheets.';
const EDIT_DENIAL = 'Unauthorized: Only runsheet editors can perform this action.';
const CAMPUS_DENIAL = 'You are not authorized for this runsheet campus.';
const NOT_FOUND = 'This runsheet no longer exists. It may have been deleted already.';
const LOOKUP_FAILED = 'Could not verify your access to this runsheet right now. Please try again.';
const NOT_FOUND_DECISION: RunsheetAccessDecision = { allowed: false, error: NOT_FOUND, notFound: true };
const LOOKUP_ATTEMPTS = 2;
const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

/** Defense-in-depth gate for server actions that read runsheet content. */
export function assertRunsheetViewAccess(session: RunsheetSession): RunsheetAccessDecision {
  return canUserAccessRunsheet(session)
    ? { allowed: true }
    : { allowed: false, error: VIEW_DENIAL };
}

type ChannelLookup =
  | { status: 'found'; name: string }
  | { status: 'missing' }
  | { status: 'not-runsheet' };

/** A Rock 404, i.e. the entity does not exist (as opposed to a transient failure). */
export function isRockNotFound(error: unknown): boolean {
  return error instanceof Error && /^Rock API error: 404\b/.test(error.message);
}

/**
 * Looks the channel up in Rock. A 404 (already deleted) is reported as
 * `missing`; any other failure is thrown so the caller can tell a transient
 * Rock/network problem apart from a real denial. One retry absorbs the
 * occasional dropped socket or 5xx.
 */
async function resolveChannelName(channelId: number): Promise<ChannelLookup> {
  if (!Number.isInteger(channelId) || channelId <= 0) return { status: 'not-runsheet' };

  for (let attempt = 1; ; attempt++) {
    try {
      const channel = (await rockGet(`/ContentChannels/${channelId}`, undefined, true)) as {
        Name?: string;
        ContentChannelTypeId?: number;
      } | null;
      if (!channel) return { status: 'missing' };
      if (channel.ContentChannelTypeId !== RUNSHEET_CONTENT_CHANNEL_TYPE_ID) return { status: 'not-runsheet' };
      return typeof channel.Name === 'string' && channel.Name.trim()
        ? { status: 'found', name: channel.Name }
        : { status: 'not-runsheet' };
    } catch (error) {
      if (isRockNotFound(error)) return { status: 'missing' };
      if (attempt >= LOOKUP_ATTEMPTS) throw error;
    }
  }
}

/**
 * Shared edit gate for every mutating server action.
 *
 * A numeric channel id is resolved to its Rock title before the caller writes.
 * A channel that is missing, is not a runsheet, or lies outside the caller's
 * view scope gets one identical not-found denial, so the gate never confirms
 * that another campus's runsheet exists; only the server log says which.
 * A caller who can view the channel but not edit it gets the campus denial.
 * The helper fails closed on lookup errors and never includes Rock ids or
 * upstream error bodies in a denial returned to a user.
 */
export async function assertRunsheetEditAccess(
  session: RunsheetSession,
  channelIdOrTitle: number | string,
): Promise<RunsheetAccessDecision> {
  if (!canUserEditRunsheet(session)) {
    return { allowed: false, error: EDIT_DENIAL };
  }

  try {
    // Grow schedules are fetched at most once, and only for a session holding
    // a Grow role whose campus access did not already decide the check.
    let growSchedules: GrowSchedule[] | undefined;
    const passes = async (check: typeof canEditRunsheetChannel, channelName: string) =>
      check(session, channelName, []) ||
      (hasGrowRole(session) && check(session, channelName, (growSchedules ??= await fetchGrowSchedules())));

    let channelName: string;
    if (typeof channelIdOrTitle === 'number') {
      const lookup = await resolveChannelName(channelIdOrTitle);
      if (lookup.status !== 'found') {
        console.warn('[runsheet-access] edit denied as not found', { channelId: channelIdOrTitle, reason: lookup.status });
        return NOT_FOUND_DECISION;
      }
      if (!(await passes(canViewRunsheetChannel, lookup.name))) {
        console.warn('[runsheet-access] edit denied as not found', { channelId: channelIdOrTitle, reason: 'outside-view-scope' });
        return NOT_FOUND_DECISION;
      }
      channelName = lookup.name;
    } else {
      channelName = channelIdOrTitle.trim();
    }

    if (channelName && (await passes(canEditRunsheetChannel, channelName))) {
      return { allowed: true, channelName };
    }

    return { allowed: false, error: CAMPUS_DENIAL };
  } catch (error) {
    console.warn('[runsheet-access] edit access lookup failed', error instanceof Error ? error.message : error);
    return { allowed: false, error: LOOKUP_FAILED };
  }
}
