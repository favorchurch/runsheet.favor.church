import 'server-only';

import { canUserAccessRunsheet, canUserEditRunsheet, hasGrowRole } from '@/lib/permissions';
import { canEditRunsheetChannel } from '@/lib/runsheetChannelAccess';
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
  /** The runsheet no longer exists in Rock (already deleted), as opposed to the caller lacking access. */
  notFound?: boolean;
}

const VIEW_DENIAL = 'You do not have access to runsheets.';
const EDIT_DENIAL = 'Unauthorized: Only runsheet editors can perform this action.';
const CAMPUS_DENIAL = 'You are not authorized for this runsheet campus.';
const NOT_FOUND = 'This runsheet no longer exists. It may have been deleted already.';
const LOOKUP_FAILED = 'Could not verify your access to this runsheet right now. Please try again.';
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

function isRockNotFound(error: unknown): boolean {
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
 * The helper fails closed on lookup errors and never includes Rock ids or
 * upstream error bodies in a denial returned to a user. A deleted channel and
 * a failed lookup get their own messages so neither masquerades as a campus
 * denial.
 */
export async function assertRunsheetEditAccess(
  session: RunsheetSession,
  channelIdOrTitle: number | string,
): Promise<RunsheetAccessDecision> {
  if (!canUserEditRunsheet(session)) {
    return { allowed: false, error: EDIT_DENIAL };
  }

  try {
    let channelName: string;
    if (typeof channelIdOrTitle === 'number') {
      const lookup = await resolveChannelName(channelIdOrTitle);
      if (lookup.status === 'missing') return { allowed: false, error: NOT_FOUND, notFound: true };
      if (lookup.status === 'not-runsheet') return { allowed: false, error: CAMPUS_DENIAL };
      channelName = lookup.name;
    } else {
      channelName = channelIdOrTitle.trim();
    }

    if (!channelName) return { allowed: false, error: CAMPUS_DENIAL };

    // Campus editors pass without the Grow schedule lookup.
    if (canEditRunsheetChannel(session, channelName, [])) {
      return { allowed: true, channelName };
    }

    // Grow editors are checked against the Grow Courses schedules only when
    // they hold a Grow role, so ordinary sessions make no extra Rock call.
    if (hasGrowRole(session) && canEditRunsheetChannel(session, channelName, await fetchGrowSchedules())) {
      return { allowed: true, channelName };
    }

    return { allowed: false, error: CAMPUS_DENIAL };
  } catch (error) {
    console.warn('[runsheet-access] edit access lookup failed', error instanceof Error ? error.message : error);
    return { allowed: false, error: LOOKUP_FAILED };
  }
}
