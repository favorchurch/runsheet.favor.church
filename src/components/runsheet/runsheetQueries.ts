'use client';

import { useQuery } from 'react-query';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import {
  RUNSHEET_QUERY_CACHE_TIME_MS,
  RUNSHEET_QUERY_STALE_TIME_MS,
} from '@/components/providers/ReactQueryProvider';
import type { AuthUser } from '@/types/AuthUser';

function sortedNumbers(values: number[] | undefined): number[] {
  return [...(values || [])].sort((a, b) => a - b);
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...(values || [])].sort();
}

/**
 * Stable, non-secret discriminator for the authorized runsheet result set.
 * The access fields are included so an in-place permission change cannot reuse
 * a prior principal's React Query data while the provider stays mounted.
 */
export function getRunsheetAccessScope(user?: AuthUser | null): string {
  const access = user?.access;
  const sections = [
    ...(access?.regionalLeaderSections || []),
    ...(access?.clusterHeadSections || []),
    ...(access?.departmentHeadSections || []),
  ]
    .map((section) => ({
      id: section.sectionId,
      campusId: section.campusId ?? null,
      kind: section.kind,
    }))
    .sort((a, b) => a.id - b.id || a.kind.localeCompare(b.kind));

  return JSON.stringify({
    principal: user?.sub || (user?.contact?.id ? `contact:${user.contact.id}` : 'anonymous'),
    access: {
      campusIds: sortedNumbers(access?.campusIds),
      connectLeaderGroupIds: sortedNumbers(access?.connectLeaderGroupIds),
      runsheetCampuses: sortedStrings(access?.runsheetCampuses),
      sections,
    },
  });
}

export const runsheetQueryKeys = {
  all: ['runsheet'] as const,
  channelsRoot: ['runsheet', 'channels'] as const,
  channels: (includeArchived: boolean, accessScope: string = 'anonymous') =>
    ['runsheet', 'channels', accessScope, includeArchived] as const,
  details: (channelId: number, accessScope: string = 'anonymous') =>
    ['runsheet', 'details', accessScope, channelId] as const,
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

export function useAvailableRunsheetChannels(includeArchived: boolean, accessScope: string = 'anonymous') {
  return useQuery(
    runsheetQueryKeys.channels(includeArchived, accessScope),
    async () => throwOnFailedRead(await rockGetAvailableRunsheetChannels(includeArchived)),
    queryBehavior,
  );
}

export function useRunsheetDetails(channelId: number | null, accessScope: string = 'anonymous') {
  return useQuery(
    runsheetQueryKeys.details(channelId ?? 0, accessScope),
    async () => throwOnFailedRead(await rockGetRunsheetDetails(channelId as number)),
    {
      ...queryBehavior,
      enabled: channelId !== null,
    },
  );
}
