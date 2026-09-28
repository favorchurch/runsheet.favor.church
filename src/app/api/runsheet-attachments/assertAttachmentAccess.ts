import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

/**
 * Attachments are editor-only, by design: a rostered viewer who can read the
 * runsheet still may not see preacher notes. Every attachment route calls this
 * before touching Rock.
 */
export async function assertAttachmentAccess(channelId: number) {
  if (!Number.isInteger(channelId) || channelId <= 0) {
    return { allowed: false as const, error: 'Invalid runsheet.' };
  }
  const session = await getRockSession();
  return assertRunsheetEditAccess(session, channelId);
}
