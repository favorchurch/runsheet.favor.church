'use client';

import { useQuery, useQueryClient, type QueryClient } from 'react-query';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { rockGetRosterAssignments } from '@/server-actions/rockGetRosterAssignments';
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

function sortedRoles(rolesMap: AuthUser['rolesMap']): Array<{ name: string; groupIds: string[] }> {
  return Object.entries(rolesMap || {})
    .map(([name, groupIds]) => ({ name, groupIds: sortedStrings(groupIds) }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
    principal: (user?.contact?.id ? `contact:${user.contact.id}` : user?.sub) || 'anonymous',
    access: {
      campusIds: sortedNumbers(access?.campusIds),
      connectLeaderGroupIds: sortedNumbers(access?.connectLeaderGroupIds),
      runsheetCampuses: sortedStrings(access?.runsheetCampuses),
      runsheetEditCampuses: sortedStrings(access?.runsheetEditCampuses),
      sections,
    },
    roles: sortedRoles(user?.rolesMap),
  });
}

export const runsheetQueryKeys = {
  all: ['runsheet'] as const,
  channelsRoot: ['runsheet', 'channels'] as const,
  channels: (includeArchived: boolean, accessScope: string = 'anonymous') =>
    ['runsheet', 'channels', accessScope, includeArchived] as const,
  details: (channelId: number, accessScope: string = 'anonymous') =>
    ['runsheet', 'details', accessScope, channelId] as const,
  rosterAssignments: (channelName: string, accessScope: string = 'anonymous') =>
    ['runsheet', 'rosterAssignments', accessScope, channelName] as const,
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

/**
 * Dev-only trace for the runsheet load.
 *
 * "The spinner never stops" has two opposite causes — one request that never
 * settles, or the same request firing over and over — and they need opposite
 * fixes. This makes the difference visible in the console: a single `start`
 * with no `done` is a hang; repeated `start` lines are a loop.
 */
let detailsFetchSeq = 0;
function traceDetailsFetch(channelId: number) {
  if (process.env.NODE_ENV === 'production') return () => undefined;
  const id = ++detailsFetchSeq;
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.warn(`[runsheet] details fetch #${id} start (channel ${channelId})`);
  return (outcome: string) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[runsheet] details fetch #${id} ${outcome} after ${Date.now() - startedAt}ms (channel ${channelId})`,
    );
  };
}

export function useRunsheetDetails(channelId: number | null, accessScope: string = 'anonymous') {
  return useQuery(
    runsheetQueryKeys.details(channelId ?? 0, accessScope),
    async () => {
      const done = traceDetailsFetch(channelId as number);
      try {
        const result = throwOnFailedRead(await rockGetRunsheetDetails(channelId as number));
        done('done');
        return result;
      } catch (err) {
        done('failed');
        throw err;
      }
    },
    {
      ...queryBehavior,
      enabled: channelId !== null,
    },
  );
}

export async function prefetchRunsheetDetails(
  queryClient: QueryClient,
  channelId: number,
  accessScope: string = 'anonymous',
) {
  if (!channelId) return;
  return queryClient.prefetchQuery(
    runsheetQueryKeys.details(channelId, accessScope),
    async () => throwOnFailedRead(await rockGetRunsheetDetails(channelId)),
    queryBehavior,
  );
}

/**
 * Rock Group Scheduler roster for this runsheet's occurrence.
 *
 * Refresh-driven by decision: fetched on mount, never polled, never refetched on
 * focus. A Group Scheduler change appears on the next page load.
 */
export function useRosterAssignments(channelName: string, enabled: boolean, accessScope: string = 'anonymous') {
  return useQuery(
    runsheetQueryKeys.rosterAssignments(channelName, accessScope),
    () => rockGetRosterAssignments(channelName),
    {
      enabled: enabled && !!channelName,
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always',
      retry: false,
    },
  );
}

export function useSafeQueryClient(): QueryClient | undefined {
  try {
    return useQueryClient();
  } catch {
    return undefined;
  }
}
