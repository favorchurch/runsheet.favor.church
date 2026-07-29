import 'server-only';

import {
  CloudflareBlockError,
  NoAccessError,
  NoRockPersonError,
  type ResolveResult,
  rockResolveAccess,
} from '@/server-actions/internal/rockResolveAccess';
import { clearSessionCache, getSessionCache, setSessionCache, type CachedSession } from '@/server-actions/sessionCache';
import { getServerSession } from './getServerSession';

export type { ResolveResult, CachedSession };
export { NoRockPersonError, NoAccessError, CloudflareBlockError };

interface RockSession extends ResolveResult {
  personId: number;
}

const ROCK_PERSON_ID_CLAIM = 'https://auth.favor.church/rock_person_id';
const ROCK_PERSON_FOUND_CLAIM = 'https://auth.favor.church/rock_person_found';

/**
 * Return the current user's Rock-backed portal session.
 *
 * Auth0 proves identity. If Post-Login claims are missing or if personId is 0,
 * it attempts email resolution against Rock API and returns a valid Volunteer session
 * so that no authenticated user is blocked from viewing runsheets.
 */
export async function getRockSession(): Promise<RockSession> {
  const session = await getServerSession();
  if (!session?.user) {
    throw new Error('FORBIDDEN');
  }

  const profile = session.user as Record<string, any>;
  const personFound = profile[ROCK_PERSON_FOUND_CLAIM];
  const personId = personFound ? Number(profile[ROCK_PERSON_ID_CLAIM]) : 0;
  const email = profile.email || profile.name || '';

  // Check cache first if valid personId
  if (personId > 0) {
    const cached = await getSessionCache(personId);
    if (cached) {
      return { ...cached, personId };
    }
  }

  // Resolve from Rock API (with email fallback lookup)
  const resolved = await rockResolveAccess(personId, email);
  const resolvedPersonId = resolved.contact.id || personId || 0;

  if (resolvedPersonId > 0) {
    await setSessionCache(resolvedPersonId, resolved);
  }

  return { ...resolved, personId: resolvedPersonId };
}

/**
 * Invalidate the cached session for the current user, forcing a re-resolve
 * on the next call to getRockSession().
 */
export async function invalidateRockSession(): Promise<void> {
  try {
    const session = await getServerSession();
    if (!session?.user) return;

    const profile = session.user as Record<string, any>;
    const personId = Number(profile[ROCK_PERSON_ID_CLAIM]);
    if (personId) {
      await clearSessionCache(personId);
    }
  } catch {
    // Silently ignore if session is unavailable
  }
}
