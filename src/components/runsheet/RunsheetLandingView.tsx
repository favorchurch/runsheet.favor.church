'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import {
  HiCalendarDays,
  HiClock,
  HiArrowRight,
  HiPlus,
  HiMagnifyingGlass,
  HiXMark,
  HiDocumentText,
  HiSparkles,
} from 'react-icons/hi2';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';
import type { RunsheetDetails } from '@/types/Runsheet';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import {
  extractChannelTime,
  formatChannelDateDisplay,
  extractChannelTitleDisplay,
} from '@/lib/runsheetDate';
import {
  prefetchRunsheetDetails,
  runsheetQueryKeys,
} from './runsheetQueries';

export interface RunsheetLandingViewProps {
  channels: RunsheetChannelOption[];
  isLoading: boolean;
  canEdit: boolean;
  showArchived: boolean;
  onToggleShowArchived?: (show: boolean) => void;
  onSelectChannel: (channelId: number) => void;
  onCreateNew?: () => void;
  onPrefetchChannel?: (channelId: number) => void;
  accessScope?: string;
}

function getCampusBadgeStyle(campus: string | null) {
  switch (campus) {
    case 'MNL':
      return {
        label: 'MNL',
        className: 'bg-blue-50 text-blue-700 border-blue-200/80 ring-1 ring-blue-500/10',
      };
    case 'BNE':
      return {
        label: 'BNE',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 ring-1 ring-emerald-500/10',
      };
    case 'SEL':
      return {
        label: 'SEL',
        className: 'bg-purple-50 text-purple-700 border-purple-200/80 ring-1 ring-purple-500/10',
      };
    default:
      return {
        label: campus || 'Service',
        className: 'bg-slate-100 text-slate-700 border-slate-200 ring-1 ring-slate-400/10',
      };
  }
}

interface RunsheetCardProps {
  channel: RunsheetChannelOption;
  accessScope: string;
  onSelect: (id: number) => void;
  onPrefetch: (id: number) => void;
}

function RunsheetCard({ channel, accessScope, onSelect, onPrefetch }: RunsheetCardProps) {
  const queryClient = useQueryClient();
  const campus = extractRunsheetCampus(channel.name);
  const campusStyle = getCampusBadgeStyle(campus);
  const titleDisplay = extractChannelTitleDisplay(channel.name);
  const dateDisplay = formatChannelDateDisplay(channel.name);
  const timeDisplay = channel.time || extractChannelTime(channel.name);

  // Check if detail data is already in cache
  const cachedDetails = queryClient.getQueryData<{ success: boolean; data?: RunsheetDetails }>(
    runsheetQueryKeys.details(channel.id, accessScope),
  );
  const itemCount = cachedDetails?.data?.items?.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(channel.id)}
      onMouseEnter={() => onPrefetch(channel.id)}
      onFocus={() => onPrefetch(channel.id)}
      data-testid={`runsheet-card-${channel.id}`}
      data-channel-id={channel.id}
      aria-label={`Select runsheet ${channel.name}`}
      className="group relative flex flex-col justify-between w-full min-h-[170px] p-5 rounded-2xl border border-slate-200/90 bg-white text-left transition-all duration-200 shadow-xs hover:shadow-lg hover:border-blue-400 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
    >
      <div>
        {/* Top Badges Row */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase ${campusStyle.className}`}
          >
            {campusStyle.label}
          </span>
          {timeDisplay && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              <HiClock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>{timeDisplay}</span>
            </span>
          )}
        </div>

        {/* Schedule Title */}
        <div className="mt-3.5">
          <h3 className="text-base font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
            {titleDisplay || channel.name}
          </h3>
          {dateDisplay && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <HiCalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{dateDisplay}</span>
            </p>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        {itemCount !== undefined ? (
          <span className="inline-flex items-center gap-1 font-medium text-slate-500">
            <HiDocumentText className="h-3.5 w-3.5 text-blue-500" />
            <span>{itemCount} {itemCount === 1 ? 'segment' : 'segments'}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
            <HiSparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Instant load</span>
          </span>
        )}

        <span className="inline-flex items-center gap-1 font-semibold text-blue-600 group-hover:text-blue-700">
          <span>Open</span>
          <HiArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
        </span>
      </div>
    </button>
  );
}

function RunsheetCardSkeleton() {
  return (
    <div className="flex flex-col justify-between w-full min-h-[170px] p-5 rounded-2xl border border-slate-200 bg-white shadow-xs animate-pulse">
      <div>
        <div className="flex items-center justify-between">
          <div className="h-5 w-14 rounded-lg bg-slate-200" />
          <div className="h-5 w-18 rounded-lg bg-slate-200" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-5 w-3/4 rounded bg-slate-200" />
          <div className="h-3.5 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="h-3.5 w-20 rounded bg-slate-100" />
        <div className="h-3.5 w-14 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export function RunsheetLandingView({
  channels,
  isLoading,
  canEdit,
  showArchived,
  onToggleShowArchived,
  onSelectChannel,
  onCreateNew,
  onPrefetchChannel,
  accessScope = 'anonymous',
}: RunsheetLandingViewProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('ALL');

  // Preload top 5 active runsheets on mount in the background
  useEffect(() => {
    if (channels && channels.length > 0) {
      const topChannels = channels.slice(0, 5);
      topChannels.forEach((ch) => {
        if (onPrefetchChannel) {
          onPrefetchChannel(ch.id);
        } else {
          prefetchRunsheetDetails(queryClient, ch.id, accessScope);
        }
      });
    }
  }, [channels, accessScope, queryClient, onPrefetchChannel]);

  const handlePrefetch = (channelId: number) => {
    if (onPrefetchChannel) {
      onPrefetchChannel(channelId);
    } else {
      prefetchRunsheetDetails(queryClient, channelId, accessScope);
    }
  };

  // Discover distinct campuses present in channels
  const distinctCampuses = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => {
      const campus = extractRunsheetCampus(c.name);
      if (campus) set.add(campus);
    });
    return Array.from(set);
  }, [channels]);

  // Filter channels by search and campus
  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return channels.filter((c) => {
      const campus = extractRunsheetCampus(c.name);
      if (selectedCampusFilter !== 'ALL' && campus !== selectedCampusFilter) {
        return false;
      }
      if (!q) return true;
      const rawName = c.name.toLowerCase();
      const time = (c.time || '').toLowerCase();
      const dateStr = (formatChannelDateDisplay(c.name) || '').toLowerCase();
      return rawName.includes(q) || time.includes(q) || dateStr.includes(q);
    });
  }, [channels, searchQuery, selectedCampusFilter]);

  return (
    <div className="w-full max-w-6xl mx-auto py-4 sm:py-6 px-1 space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-xs font-semibold text-blue-700 mb-2">
            <HiCalendarDays className="h-3.5 w-3.5" />
            <span>Service Schedule</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Select a Runsheet
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-xl">
            Choose an upcoming service schedule to view segment timings, audio/visual cues, and live details.
          </p>
        </div>

        {/* Primary Create Button (Top Action) */}
        {canEdit && onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <HiPlus className="h-4 w-4" />
            <span>Create New Runsheet</span>
          </button>
        )}
      </div>

      {/* Filter & Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 bg-white shadow-xs">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by campus, service time, or date..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-1.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <HiXMark className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Campus Filter Pills (if more than 1 campus) */}
        {distinctCampuses.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setSelectedCampusFilter('ALL')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                selectedCampusFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              All
            </button>
            {distinctCampuses.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCampusFilter(c)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  selectedCampusFilter === c
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Archived Toggle */}
        {canEdit && onToggleShowArchived && (
          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 select-none whitespace-nowrap px-1">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => onToggleShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Show Archived</span>
          </label>
        )}
      </div>

      {/* Grid of Runsheet Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5">
          <RunsheetCardSkeleton />
          <RunsheetCardSkeleton />
          <RunsheetCardSkeleton />
          <RunsheetCardSkeleton />
          <RunsheetCardSkeleton />
          <RunsheetCardSkeleton />
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60">
          <div className="p-3 rounded-full bg-slate-100 text-slate-400 mb-3">
            <HiCalendarDays className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {searchQuery ? 'No matching runsheets found' : 'No upcoming runsheets'}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm">
            {searchQuery
              ? `No runsheets matched "${searchQuery}". Try adjusting your search query.`
              : 'There are currently no active runsheets scheduled for your campus.'}
          </p>
          {canEdit && onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <HiPlus className="h-4 w-4" />
              <span>Create New Runsheet</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5">
          {filteredChannels.map((channel) => (
            <RunsheetCard
              key={channel.id}
              channel={channel}
              accessScope={accessScope}
              onSelect={onSelectChannel}
              onPrefetch={handlePrefetch}
            />
          ))}

          {/* Quick Create Card if Editor */}
          {canEdit && onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="group flex flex-col items-center justify-center min-h-[170px] p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-100/60 text-slate-600 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="p-3 rounded-full bg-white border border-slate-200 text-slate-700 group-hover:scale-110 group-hover:text-blue-600 shadow-xs transition-all">
                <HiPlus className="h-6 w-6" />
              </div>
              <span className="mt-3 text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                + Create New Runsheet
              </span>
              <span className="mt-0.5 text-xs text-slate-500">
                Setup a new service schedule
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
