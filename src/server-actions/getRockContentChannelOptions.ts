'use server';

import { rockGet } from '@/server-actions/internal/rockFetch';

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
    // 1. Fetch Content Channel Types
    const types = await rockGet('/ContentChannelTypes?$select=Id,Name&$orderby=Name asc') as Array<{ Id: number; Name: string }>;

    // 2. Fetch Categories for ContentChannels (EntityTypeId eq 209)
    const categories = await rockGet('/Categories?$filter=EntityTypeId eq 209&$select=Id,Name&$orderby=Name asc') as Array<{ Id: number; Name: string }>;

    return {
      success: true,
      types: (types || []).map(t => ({ id: t.Id, name: t.Name })),
      categories: (categories || []).map(c => ({ id: c.Id, name: c.Name })),
    };
  } catch (err: any) {
    console.error('Error fetching Rock ContentChannel options:', err);
    return {
      success: false,
      types: [],
      categories: [],
      error: err.message || 'Failed to fetch options from Rock',
    };
  }
}
