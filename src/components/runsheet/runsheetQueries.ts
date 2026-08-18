'use client';

import { useQuery } from 'react-query';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import {
  RUNSHEET_QUERY_CACHE_TIME_MS,
  RUNSHEET_QUERY_STALE_TIME_MS,
} from '@/components/providers/ReactQueryProvider';

export const runsheetQueryKeys = {
  all: ['runsheet'] as const,
  channelsRoot: ['runsheet', 'channels'] as const,
  channels: (includeArchived: boolean) => ['runsheet', 'channels', includeArchived] as const,
  details: (channelId: number) => ['runsheet', 'details', channelId] as const,
};

const queryBehavior = {
  staleTime: RUNSHEET_QUERY_STALE_TIME_MS,
  cacheTime: RUNSHEET_QUERY_CACHE_TIME_MS,
  retry: 1,
  retryDelay: 400,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
};

function throwOnFailedRead<T extends { success: boolean; error?: string }>(result: T): T {
  if (!result.success) {
    throw new Error(result.error || 'Runsheet read failed.');
  }
  return result;
}

export function useAvailableRunsheetChannels(includeArchived: boolean) {
  return useQuery(
    runsheetQueryKeys.channels(includeArchived),
    async () => throwOnFailedRead(await rockGetAvailableRunsheetChannels(includeArchived)),
    queryBehavior,
  );
}

export function useRunsheetDetails(channelId: number | null) {
  return useQuery(
    runsheetQueryKeys.details(channelId ?? 0),
    async () => throwOnFailedRead(await rockGetRunsheetDetails(channelId as number)),
    {
      ...queryBehavior,
      enabled: channelId !== null,
    },
  );
}
