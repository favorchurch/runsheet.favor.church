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
  /**
   * The raw parsed `rock_person_ids` claim plus the effective person id —
   * **display/matching only, NEVER an authorization input.** It is deliberately
   * NOT gated on `personFound`/`email_verified`, so a session the app distrusted
   * can still populate it. Authorization uses the gated set built by
   * `buildUnionPersonIds` and passed to `rockResolveAccess`; read `rolesMap` and
   * `access` for anything access-related.
   */
  personIds: number[];
}

const ROCK_PERSON_ID_CLAIM = 'https://auth.favor.church/rock_person_id';
const ROCK_PERSON_FOUND_CLAIM = 'https://auth.favor.church/rock_person_found';
const ROCK_PERSON_IDS_CLAIM = 'https://auth.favor.church/rock_person_ids';

function parseRockPersonIds(rawPersonIds: unknown, personId: number): number[] {
  if (
    Array.isArray(rawPersonIds) &&
    rawPersonIds.length > 0 &&
    rawPersonIds.every(
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0,
    )
  ) {
    return [...new Set(rawPersonIds)];
  }

  return personId > 0 ? [personId] : [];
}

function withEffectivePersonId(personIds: number[], effectivePersonId: number): number[] {
  if (effectivePersonId > 0 && !personIds.includes(effectivePersonId)) {
    return [...personIds, effectivePersonId];
  }

  return personIds;
}

/** The scalar `rock_person_id`/`rock_person_found` resolution shared by `getRockSession` and `invalidateRockSession`. */
function resolvePersonIdFromClaims(profile: Record<string, any>): { personId: number; personFound: unknown } {
  const personFound = profile[ROCK_PERSON_FOUND_CLAIM];
  const rawPersonId = profile[ROCK_PERSON_ID_CLAIM];
  let personId = 0;
  if (personFound !== false && rawPersonId != null) {
    const parsed = Number(rawPersonId);
    if (Number.isInteger(parsed) && parsed > 0) {
      personId = parsed;
    }
  }
  return { personId, personFound };
}

/**
 * Build the person-id set actually used for *authorization* (union of Rock
 * memberships). Gated on the same signal that governs the scalar id (a0cfeac
 * / G14): when the app distrusted the scalar id, the claimed id array must
 * not resurrect roles. Ungated resolution is exactly `[personId]` (or `[]`),
 * matching pre-union behavior one-for-one.
 *
 * When gated, the primary id is placed first explicitly:
 * `[personId, ...claimedPersonIds.filter(id => id !== personId)]`. The claim
 * arrives sorted ascending (post-login.js:677), not primary-first, so passing
 * it through unchanged would bind identity/ordering to the lowest household
 * id instead of the actual signed-in person.
 */
function buildUnionPersonIds(personId: number, personFound: unknown, claimedPersonIds: number[]): number[] {
  const isGated = personFound !== false && personId > 0;
  if (!isGated) {
    return personId > 0 ? [personId] : [];
  }
  return [personId, ...claimedPersonIds.filter((id) => id !== personId)];
}

/**
 * Return the current user's Rock-backed portal session.
 *
 * Auth0 proves identity. If Post-Login claims are missing or if personId is 0,
 * it attempts email resolution against Rock API only when Auth0 has verified the
 * email claim. A verified email that is not found in Rock remains denied by the
 * access policy; authentication alone does not grant runsheet access.
 */
export async function getRockSession(): Promise<RockSession> {
  const session = await getServerSession();
  if (!session?.user) {
    throw new Error('FORBIDDEN');
  }

  const profile = session.user as Record<string, any>;
  const { personId, personFound } = resolvePersonIdFromClaims(profile);
  const claimedPersonIds = parseRockPersonIds(profile[ROCK_PERSON_IDS_CLAIM], personId);
  // Authorization id set (may be `[personId]`/`[]` when ungated) — computed
  // once, used for the cache read, the Rock resolve call, and the cache
  // write, so all three agree on what was actually unioned.
  const unionPersonIds = buildUnionPersonIds(personId, personFound, claimedPersonIds);

  const rawEmail = typeof profile.email === 'string' ? profile.email.trim() : '';
  const emailVerifiedClaim = profile.email_verified;
  // Only an affirmatively verified claim admits the email fallback (G14). An
  // omitted or non-affirmative claim must NOT resolve: the fallback hands back
  // that Rock person's full rolesMap, so an unverified address matching a staff
  // email would inherit staff access. `'true'` covers IdPs that stringify the
  // claim; every other shape, absence included, fails closed.
  const isEmailVerified = emailVerifiedClaim === true || emailVerifiedClaim === 'true';
  const email = isEmailVerified ? rawEmail : '';

  // Check cache first if valid personId
  if (personId > 0) {
    const cached = await getSessionCache(personId, unionPersonIds);
    if (cached) {
      return { ...cached, personId, personIds: withEffectivePersonId(claimedPersonIds, personId) };
    }
  }

  // Resolve from Rock API (with email fallback lookup)
  const resolved = await rockResolveAccess(unionPersonIds, email);
  const resolvedPersonId = resolved.contact.id || personId || 0;

  // The write MUST key on the same primaryId the read above used, or
  // invalidation and re-reads silently miss (the v4 bug: the write keyed on
  // `resolvedPersonId` while the read keyed on `personId`).
  //
  // We therefore only write when `personId > 0` — exactly the condition the
  // read at the top is gated on. On the pure email-fallback path
  // (`personId === 0`) there is deliberately NO write: nothing could ever read
  // that entry back, and `invalidateRockSession` cannot derive its key from the
  // claims either, so writing it would leave an unevictable entry serving
  // resolved access for the full TTL after logout.
  //
  // Never cache a degraded result either: a `partial` resolve dropped a
  // secondary id after a real fetch failure, so caching it would keep serving
  // an incomplete union for the rest of the TTL.
  if (personId > 0 && resolved.partial !== true) {
    await setSessionCache(personId, unionPersonIds, resolved);
  }

  return {
    ...resolved,
    personId: resolvedPersonId,
    personIds: withEffectivePersonId(claimedPersonIds, resolvedPersonId),
  };
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
    const { personId, personFound } = resolvePersonIdFromClaims(profile);
    if (personId > 0) {
      // Re-derive the same union set `getRockSession` would have written
      // with, through the same helpers, so logout/profile-change clears the
      // key a session actually wrote instead of one nothing wrote.
      const claimedPersonIds = parseRockPersonIds(profile[ROCK_PERSON_IDS_CLAIM], personId);
      const unionPersonIds = buildUnionPersonIds(personId, personFound, claimedPersonIds);
      await clearSessionCache(personId, unionPersonIds);
    }
  } catch {
    // Silently ignore if session is unavailable
  }
}
