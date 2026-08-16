'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

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
    const categories = (await rockGet('/Categories?$filter=EntityTypeId eq 209&$select=Id,Name&$orderby=Name asc')) as Array<{ Id: number; Name: string }>;

    const filteredCategories = (categories || []).filter((c) => {
      const nameLower = c.Name.toLowerCase().trim();
      return nameLower !== 'external website' && nameLower !== 'internal';
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
