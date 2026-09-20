'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { cleanSongTitle } from '@/lib/songUtils';
import { parseRockSongContent } from '@/lib/songParser';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';
import { SongDetails } from '@/types/Song';

export interface RockGetSongDetailsResult {
  success: boolean;
  song: SongDetails | null;
  error?: string;
}

export async function rockGetSongDetails(params: {
  songId?: number | null;
  title?: string | null;
}): Promise<RockGetSongDetailsResult> {
  try {
    const session = await getRockSession();
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) {
      return { success: false, song: null, error: access.error };
    }

    const { songId, title } = params;

    let songItem: { Id: number; Title: string; Content?: string | null } | null = null;

    if (songId && Number.isSafeInteger(songId) && songId > 0) {
      const items = (await rockGet('/ContentChannelItems', {
        $filter: `ContentChannelId eq 18 and Id eq ${songId}`,
        $top: 1,
      })) as Array<{ Id: number; Title: string; Content?: string | null }> | null;

      songItem = items?.[0] || null;
    } else if (title && title.trim()) {
      const clean = cleanSongTitle(title);
      const q = clean.replace(/'/g, "''");
      const items = (await rockGet('/ContentChannelItems', {
        $filter: `ContentChannelId eq 18 and substringof('${q}', Title)`,
        $top: 10,
      })) as Array<{ Id: number; Title: string; Content?: string | null }> | null;

      if (items && items.length > 0) {
        songItem =
          items.find(
            (it) => cleanSongTitle(it.Title).toLowerCase() === clean.toLowerCase()
          ) || items[0];
      }
    }

    if (!songItem) {
      return { success: true, song: null };
    }

    const parsedDetails = parseRockSongContent(songItem);

    return {
      success: true,
      song: parsedDetails,
    };
  } catch (err: any) {
    console.error('Error fetching song details from Rock RMS:', err);
    return {
      success: false,
      song: null,
      error: 'Failed to fetch song details',
    };
  }
}
