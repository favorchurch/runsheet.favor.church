'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { cleanSongTitle } from '@/lib/songUtils';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

export interface SongOption {
  id: number;
  rawTitle: string;
  cleanTitle: string;
}

export async function rockSearchSongs(query = ''): Promise<{
  success: boolean;
  songs: SongOption[];
  error?: string;
}> {
  try {
    const session = await getRockSession();
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) return { success: false, songs: [], error: access.error };

    const q = query.trim().replace(/'/g, "''");
    const filter = q
      ? `ContentChannelId eq 18 and substringof('${q}', Title)`
      : `ContentChannelId eq 18`;

    const items = (await rockGet('/ContentChannelItems', {
      $filter: filter,
      $select: 'Id,Title',
      $top: 50,
      $orderby: 'Title asc',
    })) as Array<{ Id: number; Title: string }> | null;

    if (!items) {
      return { success: true, songs: [] };
    }

    const seenCleanTitles = new Set<string>();
    const songs: SongOption[] = [];

    for (const item of items) {
      const clean = cleanSongTitle(item.Title);
      if (clean && !seenCleanTitles.has(clean.toLowerCase())) {
        seenCleanTitles.add(clean.toLowerCase());
        songs.push({
          id: item.Id,
          rawTitle: item.Title,
          cleanTitle: clean,
        });
      }
    }

    return {
      success: true,
      songs,
    };
  } catch (err: any) {
    console.error('Error searching songs in Rock RMS:', err);
    return {
      success: false,
      songs: [],
      error: 'Failed to search songs',
    };
  }
}
