import 'server-only';

import { canUserAccessRunsheet, canUserEditRunsheet } from '@/lib/permissions';
import { canAccessRunsheetChannel } from '@/lib/runsheetCampus';
import { rockGet } from '@/server-actions/internal/rockFetch';
import type { AuthAccess, AuthRolesMap } from '@/types/AuthUser';

type RunsheetSession = {
  rolesMap?: AuthRolesMap;
  access?: Pick<AuthAccess, 'runsheetCampuses'>;
} | null | undefined;

export interface RunsheetAccessDecision {
  allowed: boolean;
  error?: string;
  channelName?: string;
}

const VIEW_DENIAL = 'You do not have access to runsheets.';
const EDIT_DENIAL = 'Unauthorized: Only runsheet editors can perform this action.';
const CAMPUS_DENIAL = 'You are not authorized for this runsheet campus.';
const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;

/** Defense-in-depth gate for server actions that read runsheet content. */
export function assertRunsheetViewAccess(session: RunsheetSession): RunsheetAccessDecision {
  return canUserAccessRunsheet(session)
    ? { allowed: true }
    : { allowed: false, error: VIEW_DENIAL };
}

async function resolveChannelName(channelId: number): Promise<string | null> {
  if (!Number.isInteger(channelId) || channelId <= 0) return null;

  const channel = (await rockGet(`/ContentChannels/${channelId}`, undefined, true)) as {
    Name?: string;
    ContentChannelTypeId?: number;
  } | null;
  if (channel?.ContentChannelTypeId !== RUNSHEET_CONTENT_CHANNEL_TYPE_ID) return null;
  return typeof channel.Name === 'string' && channel.Name.trim() ? channel.Name : null;
}

/**
 * Shared edit gate for every mutating server action.
 *
 * A numeric channel id is resolved to its Rock title before the caller writes.
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
    const channelName =
      typeof channelIdOrTitle === 'number' ? await resolveChannelName(channelIdOrTitle) : channelIdOrTitle.trim();

    if (!channelName || !canAccessRunsheetChannel(session?.access?.runsheetCampuses, channelName)) {
      return { allowed: false, error: CAMPUS_DENIAL };
    }

    return { allowed: true, channelName };
  } catch {
    return { allowed: false, error: CAMPUS_DENIAL };
  }
}
