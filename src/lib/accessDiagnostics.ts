import type { AuthUser } from '@/types/AuthUser';

export interface AccessDiagnostics {
  personId?: number;
  personResolved: boolean;
  membershipCountsByGroupType: Record<number | string, number>;
  membershipCounts?: Record<number | string, number>;
  rosterKeyCount: number;
  rosterLookupFailed?: boolean;
}

export interface LogAccessDenialParams {
  personId?: number;
  personResolved?: boolean;
  membershipCountsByGroupType?: Record<number | string, number>;
  rosterKeyCount?: number;
  rosterLookupFailed?: boolean;
  reason: string;
  user?: AuthUser;
}

/**
 * Format a single structured denial log line.
 * Never includes email, tokens, or personal identifiers other than Rock personId.
 */
export function formatAccessDenial(
  paramOrUser: LogAccessDenialParams | AuthUser | null | undefined,
  maybeReason?: string,
): string {
  let params: LogAccessDenialParams;

  if (typeof maybeReason === 'string') {
    params = {
      reason: maybeReason,
      user: (paramOrUser as AuthUser) ?? undefined,
    };
  } else if (paramOrUser && typeof paramOrUser === 'object' && 'reason' in paramOrUser) {
    params = paramOrUser as LogAccessDenialParams;
  } else {
    params = {
      reason: 'unknown',
      user: (paramOrUser as AuthUser) ?? undefined,
    };
  }

  const user = params.user;
  const diagnostics = user?.accessDiagnostics;

  const personId =
    params.personId ??
    diagnostics?.personId ??
    user?.contact?.id ??
    (user?.sub && /^\d+$/.test(user.sub) ? Number(user.sub) : 0);

  const personResolved =
    params.personResolved ??
    diagnostics?.personResolved ??
    personId > 0;

  const membershipCountsByGroupType =
    params.membershipCountsByGroupType ??
    diagnostics?.membershipCountsByGroupType ??
    diagnostics?.membershipCounts ??
    {};

  const rosterKeyCount =
    params.rosterKeyCount ??
    diagnostics?.rosterKeyCount ??
    (user?.rolesMap?.rosteredViewer?.length ?? 0);

  const rosterLookupFailed =
    params.rosterLookupFailed ??
    diagnostics?.rosterLookupFailed ??
    false;

  // Sanitize reason to never leak email addresses
  const reason = String(params.reason || 'unknown').replace(
    /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
    '[REDACTED_EMAIL]',
  );

  const countsStr = JSON.stringify(membershipCountsByGroupType);

  return `[runsheet-access] denial reason=${reason} personId=${personId} personResolved=${personResolved} membershipCountsByGroupType=${countsStr} rosterKeyCount=${rosterKeyCount} rosterLookupFailed=${rosterLookupFailed}`;
}

/**
 * Emits a single structured log line prefixed `[runsheet-access] denial`.
 * Contains personId, personResolved, membership counts by group type,
 * rosterKeyCount, rosterLookupFailed, and reason.
 * Never logs user email, tokens, or names.
 */
export function logAccessDenial(
  paramOrUser: LogAccessDenialParams | AuthUser | null | undefined,
  maybeReason?: string,
): string {
  const line = formatAccessDenial(paramOrUser, maybeReason);
  console.warn(line);
  return line;
}
