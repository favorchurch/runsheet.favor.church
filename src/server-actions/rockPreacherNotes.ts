'use server';

import { z } from 'zod';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { PreacherNote } from '@/types/PreacherNotes';

const ChannelIdSchema = z.object({
  channelId: z.number().int().positive('Channel id must be a positive integer'),
});

const UnlinkSchema = z.object({
  channelId: z.number().int().positive('Channel id must be a positive integer'),
  path: z.string().trim().min(1, 'Path is required'),
});

export interface PreacherNotesActionResult {
  success: boolean;
  error?: string;
  notes?: PreacherNote[];
}

/**
 * Reads the list of Preacher Notes for a runsheet channel.
 * Requires runsheet edit access.
 */
export async function rockGetPreacherNotes(channelId: number): Promise<PreacherNotesActionResult> {
  const parsed = ChannelIdSchema.safeParse({ channelId });
  if (!parsed.success) {
    return { success: false, error: 'Invalid channel id.' };
  }

  let session;
  try {
    session = await getRockSession();
  } catch {
    return { success: false, error: 'Unauthorized: Authentication required.' };
  }

  const access = await assertRunsheetEditAccess(session, parsed.data.channelId);
  if (!access.allowed) {
    return { success: false, error: access.error };
  }

  try {
    const notes = await getPreacherNotesAttributeValue(parsed.data.channelId);
    return { success: true, notes };
  } catch (err) {
    console.error('Failed to get preacher notes:', err);
    return { success: false, error: 'Failed to retrieve preacher notes.' };
  }
}

/**
 * Unlinks a Preacher Note from a runsheet channel.
 * Does NOT delete the file from Rock Asset Manager storage; only removes the entry from the attribute list.
 * Requires runsheet edit access.
 */
export async function rockUnlinkPreacherNote(
  channelId: number,
  path: string,
): Promise<PreacherNotesActionResult> {
  const parsed = UnlinkSchema.safeParse({ channelId, path });
  if (!parsed.success) {
    return { success: false, error: 'Invalid channel id or path.' };
  }

  let session;
  try {
    session = await getRockSession();
  } catch {
    return { success: false, error: 'Unauthorized: Authentication required.' };
  }

  const access = await assertRunsheetEditAccess(session, parsed.data.channelId);
  if (!access.allowed) {
    return { success: false, error: access.error };
  }

  try {
    const updated = await mutatePreacherNotesAttribute(parsed.data.channelId, (current) => {
      return current.filter((note) => note.path !== parsed.data.path);
    });
    return { success: true, notes: updated };
  } catch (err) {
    console.error('Failed to unlink preacher note:', err);
    return { success: false, error: 'Failed to unlink preacher note.' };
  }
}

