'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';

export interface RunsheetChannelOption {
  id: number;
  name: string;
}

export async function rockGetAvailableRunsheetChannels(): Promise<{
  success: boolean;
  channels: RunsheetChannelOption[];
  error?: string;
}> {
  try {
    // Require active Rock session
    await getRockSession();

    // Fetch Content Channels from Rock RMS
    const channels = (await rockGet('/ContentChannels', {
      $select: 'Id,Name,ContentChannelTypeId',
      $orderby: 'Id desc',
      $top: 200,
    })) as Array<{ Id: number; Name: string }> | null;

    const formattedChannels: RunsheetChannelOption[] = (channels || []).map((c) => ({
      id: c.Id,
      name: c.Name,
    }));

    return {
      success: true,
      channels: formattedChannels,
    };
  } catch (err: any) {
    console.error('Error fetching runsheet channels from Rock:', err);
    return {
      success: false,
      channels: [],
      error: err?.message || 'Failed to fetch runsheet channels',
    };
  }
}
