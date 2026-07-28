'use server';
import 'server-only';

import { AuthContact } from '@/types/AuthUser';
import { getRockSession } from './getRockSession';

/**
 * Get the current user's Rock contact info.
 * Resolves from cache or Rock API via getRockSession().
 */
export async function getAuthUserContact(): Promise<NonNullable<AuthContact>> {
  const { contact } = await getRockSession();
  return contact;
}
