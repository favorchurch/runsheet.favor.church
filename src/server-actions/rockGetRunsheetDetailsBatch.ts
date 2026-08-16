'use server';

import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { RunsheetDetails } from '@/types/Runsheet';

export interface BatchRunsheetResult {
  channelId: number;
  success: boolean;
  data?: RunsheetDetails;
  error?: string;
}

/** Loads several runsheet channels in parallel for propagation targets and compare view. */
export async function rockGetRunsheetDetailsBatch(channelIds: number[]): Promise<BatchRunsheetResult[]> {
  return Promise.all(
    channelIds.map(async (channelId) => {
      const res = await rockGetRunsheetDetails(channelId);
      return { channelId, success: res.success, data: res.data, error: res.error };
    }),
  );
}
