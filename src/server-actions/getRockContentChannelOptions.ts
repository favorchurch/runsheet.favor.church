'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID } from '@/lib/growRunsheets';
import { GROW_EDITOR_ROLE } from '@/lib/permissions';
import { canSeeRunsheetCategory } from '@/lib/runsheetCampus';

export interface ContentChannelTypeOption {
  id: number;
  name: string;
}

export interface ContentChannelCategoryOption {
  id: number;
  name: string;
}

export async function getRockContentChannelOptions() {
  try {
    const session = await getRockSession();
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) {
      return { success: false, types: [], categories: [], error: access.error };
    }

    // 1. Fetch Content Channel Types (restricted to "Service Runsheet", Id 13)
    const types = (await rockGet("/ContentChannelTypes?$filter=Id eq 13 or Name eq 'Service Runsheet'&$select=Id,Name&$orderby=Name asc")) as Array<{ Id: number; Name: string }>;

    // 2. Fetch Categories for ContentChannels (EntityTypeId eq 209), excluding External Website & Internal
    const categories = (await rockGet('/Categories?$filter=EntityTypeId eq 209&$select=Id,Name&$orderby=Order asc,Name asc')) as Array<{ Id: number; Name: string }>;

    // Campus scoping happens here, not in the form: a campus-marked category
    // is listed only for callers holding that campus. Grow editors keep the
    // Grow category whatever their campuses.
    const isGrowEditor = Boolean(session?.rolesMap?.[GROW_EDITOR_ROLE]?.length);
    const filteredCategories = (categories || []).filter((c) => {
      const nameLower = c.Name.toLowerCase().trim();
      if (nameLower === 'external website' || nameLower === 'internal') return false;
      if (isGrowEditor && c.Id === GROW_CONTENT_CHANNEL_CATEGORY_ID) return true;
      return canSeeRunsheetCategory(session?.access?.runsheetCampuses, c.Name);
    });

    return {
      success: true,
      types: (types || []).map(t => ({ id: t.Id, name: t.Name })),
      categories: filteredCategories.map(c => ({ id: c.Id, name: c.Name })),
    };
  } catch (err: any) {
    console.error('Error fetching Rock ContentChannel options:', err);
    return {
      success: false,
      types: [],
      categories: [],
      error: 'Failed to fetch options from Rock',
    };
  }
}
