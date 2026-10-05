'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getRockContentChannelOptions, ContentChannelCategoryOption } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions, ScheduleOption } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { buildGrowRunsheetTitle, GROW_CONTENT_CHANNEL_CATEGORY_ID, GROW_SCHEDULE_CATEGORY_ID } from '@/lib/growRunsheets';
import type { RockRosterAssignmentsResult } from '@/server-actions/rockGetRosterAssignments';
import toast from 'react-hot-toast';

/**
 * `YYYY-MM-DD` for a date, read in the viewer's own timezone.
 *
 * Never `toISOString()` here: that serialises in UTC, so a locally-built date in
 * Manila (UTC+8) comes back as the *previous* day any time before 08:00. That is
 * how "MNL Crowne // October 3, 2026" — a Saturday — was created for a Sunday
 * service, and why its roster then matched nothing in Rock.
 */
export function toLocalIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getNextSunday(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return toLocalIsoDate(d);
}

export function formatDateToWordy(dateStr: string) {
  // `new Date('2026-10-04')` is parsed as UTC midnight, which renders as the
  // previous day west of Greenwich. The explicit time makes it local.
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * A schedule's name with its time removed, so the sessions of one service
 * group together: "MNL Crowne 9AM" and "MNL Crowne 11:30AM" -> "MNL Crowne",
 * while "MNL Crowne 9AM - Kids" stays separate as "MNL Crowne - Kids".
 */
export function sessionBaseName(name: string): string {
  return name
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateRunsheetTitle(
  sessionName: string,
  dateStr: string,
  timeLabel?: string,
  categoryName?: string
): string {
  const formattedDate = formatDateToWordy(dateStr);
  if (!sessionName) {
    const prefix = categoryName || 'Runsheet';
    const slot = timeLabel || 'AM';
    return `${prefix} // ${formattedDate} // ${slot}`;
  }

  const m = sessionName.match(/^(.*?)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(.*)$/i);
  if (m) {
    const before = m[1].trim();
    const timeSlot = m[2].trim().toUpperCase().replace(/\s+/g, '');
    const after = m[3].trim();
    let prefix = after ? `${before} ${after}`.trim() : before;
    prefix = prefix.replace(/\s+/g, ' ').replace(/^[\s|\-]+|[\s|\-]+$/g, '');

    if (!prefix) {
      prefix = categoryName || 'Runsheet';
    }

    return `${prefix} // ${formattedDate} // ${timeSlot}`;
  }

  const prefix = sessionName.trim() || categoryName || 'Runsheet';
  const slot = (timeLabel || 'AM').trim().toUpperCase().replace(/\s+/g, '');
  return `${prefix} // ${formattedDate} // ${slot}`;
}

import { ALL_CAMPUSES, extractRunsheetCampus, RunsheetCampusCode } from '@/lib/runsheetCampus';
import type { RunsheetDetails } from '@/types/Runsheet';

function extractCategoryCampus(catName: string): RunsheetCampusCode | null {
  if (!catName) return null;
  const upper = catName.toUpperCase();
  if (upper.includes('MNL') || upper.includes('MANILA')) return 'MNL';
  if (upper.includes('BNE') || upper.includes('BRISBANE')) return 'BNE';
  if (upper.includes('SEL') || upper.includes('SEOUL')) return 'SEL';
  return null;
}

interface CreateRunsheetFormProps {
  runsheetCampuses?: string[];
  growOnly?: boolean;
  onCreated?: (
    channelId: number,
    title: string,
    createdData?: RunsheetDetails,
    rosterData?: RockRosterAssignmentsResult,
  ) => void;
  onCancel?: () => void;
}

export function CreateRunsheetForm({ runsheetCampuses, growOnly, onCreated, onCancel }: CreateRunsheetFormProps) {
  const [categories, setCategories] = useState<ContentChannelCategoryOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const [selectedTypeId, setSelectedTypeId] = useState<number>(13);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [date, setDate] = useState(getNextSunday());
  const [session, setSession] = useState('');
  const [title, setTitle] = useState('');
  const [batchCreateDateWide, setBatchCreateDateWide] = useState(false);
  const [batchCreateUpcoming, setBatchCreateUpcoming] = useState(false);
  const [upcomingCount, setUpcomingCount] = useState<number>(4);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const userEditedDateRef = useRef(false);

  const selectedSchedule = React.useMemo(
    () => schedules.find((s) => s.name === session),
    [schedules, session]
  );
  const isGrowSchedule = selectedSchedule?.categoryId === GROW_SCHEDULE_CATEGORY_ID;

  // Many things happen on one date, so the date-wide batch only covers the
  // other sessions of the selected service (same name, different time).
  const dateSchedules = React.useMemo(() => {
    if (!selectedSchedule) return [];
    const base = sessionBaseName(selectedSchedule.name).toLowerCase();
    return schedules.filter(
      (s) => sessionBaseName(s.name).toLowerCase() === base && s.upcomingOccurrences?.some((o) => o.date === date)
    );
  }, [schedules, selectedSchedule, date]);

  const nonGrowUpcomingOccurrences = React.useMemo(() => {
    if (!selectedSchedule?.upcomingOccurrences) return [];
    return selectedSchedule.upcomingOccurrences.filter((o) => o.date >= date);
  }, [selectedSchedule, date]);

  const isGlobalStaffOrAdmin = React.useMemo(
    () => !runsheetCampuses || runsheetCampuses.includes(ALL_CAMPUSES),
    [runsheetCampuses]
  );
  const userAllowedCampuses = React.useMemo(
    () => (runsheetCampuses || []).filter((c) => c !== ALL_CAMPUSES) as RunsheetCampusCode[],
    [runsheetCampuses]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const res = await getRockContentChannelOptions();
        if (cancelled) return;
        if (res.success) {
          const isGlobal = !runsheetCampuses || runsheetCampuses.includes(ALL_CAMPUSES);
          const allowed = (runsheetCampuses || []).filter((c) => c !== ALL_CAMPUSES) as RunsheetCampusCode[];

          let filteredCats = res.categories;

          if (!isGlobal && allowed.length > 0) {
            filteredCats = res.categories.filter((cat) => {
              const catCampus = extractCategoryCampus(cat.name);
              return catCampus === null || allowed.includes(catCampus);
            });
          }

          // A Grow-only editor may create Grow runsheets only (under MNL | ALL EVENTS).
          if (growOnly) {
            filteredCats = filteredCats.filter((cat) => cat.id === GROW_CONTENT_CHANNEL_CATEGORY_ID);
          }

          setCategories(filteredCats);

          if (res.types.length > 0) {
            setSelectedTypeId(res.types[0].id);
          }

          if (filteredCats.length > 0) {
            const initialCatId = filteredCats[0].id;
            setSelectedCategoryId(initialCatId);
          }
        } else {
          setStatus({ type: 'error', message: res.error || 'Failed to load options from Rock.' });
        }
      } catch (err: any) {
        console.error('Error loading options in CreateRunsheetForm:', err);
        setStatus({ type: 'error', message: err?.message || 'Failed to load options from Rock.' });
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) return;
    let cancelled = false;

    async function loadSchedules() {
      setLoadingSchedules(true);
      try {
        const res = await rockGetScheduleOptions(Number(selectedCategoryId), date);
        if (cancelled) return;
        if (res.success && res.schedules) {
          setSchedules(res.schedules);
          setSession((prevSession) => {
            const exists = res.schedules.some((s) => s.name === prevSession);
            if (exists) return prevSession;
            return res.schedules.length > 0 ? res.schedules[0].name : 'AM';
          });
        }
      } catch (err: any) {
        console.error('Error loading schedules in CreateRunsheetForm:', err);
      } finally {
        if (!cancelled) setLoadingSchedules(false);
      }
    }

    loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, date]);

  // Schedules with a designated next occurrence (Grow, Youth, etc.): jump the date to it.
  useEffect(() => {
    if (userEditedDateRef.current) return;
    const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
    const isYouth = /youth/i.test(selectedCategory?.name || '');
    const isGrow = schedules.find((s) => s.name === session)?.categoryId === GROW_SCHEDULE_CATEGORY_ID;
    if (!isGrow && !isYouth) return;

    const next = schedules.find((s) => s.name === session)?.nextDate || schedules[0]?.nextDate;
    if (next && next !== date) setDate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, schedules, selectedCategoryId, categories]);

  useEffect(() => {
    const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
    const selectedSchedule = schedules.find((s) => s.name === session);
    // Grow titles must match the Grow sync's format, or the sync would duplicate them.
    if (selectedSchedule?.categoryId === GROW_SCHEDULE_CATEGORY_ID) {
      setTitle(buildGrowRunsheetTitle(selectedSchedule.name, date, selectedSchedule.timeLabel));
      return;
    }
    const autoTitle = generateRunsheetTitle(
      session,
      date,
      selectedSchedule?.timeLabel,
      selectedCategory?.name
    );
    setTitle(autoTitle);
  }, [session, date, selectedCategoryId, categories, schedules, selectedSchedule]);

  const dateRef = useRef(date);
  dateRef.current = date;
  const selectedScheduleId = selectedSchedule?.id;

  useEffect(() => {
    setBatchCreateDateWide(false);
    setBatchCreateUpcoming(false);
    const occs = (selectedSchedule?.upcomingOccurrences || []).filter((o) => o.date >= dateRef.current);
    if (occs.length > 0) {
      setUpcomingCount(Math.min(4, Math.max(1, occs.length)));
    } else {
      setUpcomingCount(4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedCategoryId, selectedScheduleId]);

  useEffect(() => {
    setBatchCreateDateWide(false);
  }, [date]);

  useEffect(() => {
    if (!isGrowSchedule && nonGrowUpcomingOccurrences.length < 2) {
      setBatchCreateUpcoming(false);
    }
  }, [isGrowSchedule, nonGrowUpcomingOccurrences.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      setStatus({ type: 'error', message: 'Please select a Category.' });
      return;
    }

    const isBatch = batchCreateDateWide || batchCreateUpcoming;
    const finalTitle = title.trim();

    if (!isBatch) {
      if (!finalTitle) {
        setStatus({ type: 'error', message: 'Please enter a Runsheet Title.' });
        return;
      }

      if (!isGlobalStaffOrAdmin && userAllowedCampuses.length > 0) {
        const titleCampus = extractRunsheetCampus(finalTitle);
        if (titleCampus && !userAllowedCampuses.includes(titleCampus)) {
          setStatus({
            type: 'error',
            message: `You are only authorized to create runsheets for your assigned campus (${userAllowedCampuses.join(', ')}).`,
          });
          return;
        }
      }
    }

    setStatus({ type: 'loading' });

    if (isBatch) {
      const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
      let itemsToCreate: string[] = [];

      if (batchCreateDateWide) {
        itemsToCreate = dateSchedules.map((s) => {
          const occ = s.upcomingOccurrences?.find((o) => o.date === date);
          const timeLabel = occ?.time || s.timeLabel;
          if (s.categoryId === GROW_SCHEDULE_CATEGORY_ID) {
            return buildGrowRunsheetTitle(s.name, date, timeLabel);
          }
          return generateRunsheetTitle(s.name, date, timeLabel, selectedCategory?.name);
        });
      } else if (batchCreateUpcoming) {
        if (isGrowSchedule) {
          const occurrences = selectedSchedule?.upcomingOccurrences || [];
          itemsToCreate = occurrences.map((occ) => {
            return buildGrowRunsheetTitle(selectedSchedule!.name, occ.date, occ.time);
          });
        } else {
          const occurrences = nonGrowUpcomingOccurrences;
          const count = Math.min(Math.max(1, upcomingCount), occurrences.length);
          const targetOccurrences = occurrences.slice(0, count);
          itemsToCreate = targetOccurrences.map((occ) => {
            return generateRunsheetTitle(
              selectedSchedule!.name,
              occ.date,
              occ.time || selectedSchedule!.timeLabel,
              selectedCategory?.name
            );
          });
        }
      }

      let firstCreated: {
        id: number;
        title: string;
        data?: RunsheetDetails;
        rosterData?: RockRosterAssignmentsResult;
      } | null = null;
      let firstSkipped: { id?: number; title: string } | null = null;
      let createdCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const skippedTitles: string[] = [];
      const failedTitles: string[] = [];

      for (const itemTitle of itemsToCreate) {
        try {
          const res = await rockCreateServiceRunsheet(
            itemTitle,
            Number(selectedTypeId || 13),
            Number(selectedCategoryId),
            { skipIfExists: true }
          );
          if (res.success) {
            if (res.skipped) {
              skippedCount++;
              skippedTitles.push(itemTitle);
              if (!firstSkipped) {
                firstSkipped = { id: res.id, title: itemTitle };
              }
            } else if (res.id) {
              createdCount++;
              if (!firstCreated) {
                firstCreated = {
                  id: res.id,
                  title: itemTitle,
                  data: res.data,
                  rosterData: res.rosterData,
                };
              }
            } else {
              failedCount++;
              failedTitles.push(itemTitle);
            }
          } else {
            failedCount++;
            failedTitles.push(itemTitle);
          }
        } catch (err) {
          console.warn(`Could not create runsheet "${itemTitle}":`, err);
          failedCount++;
          failedTitles.push(itemTitle);
        }
      }

      if (createdCount === 0 && skippedCount === 0) {
        const errorMsg = failedCount > 0 ? `Failed to create runsheets (${failedCount} failed).` : 'Failed to create runsheets.';
        setStatus({ type: 'error', message: errorMsg });
        toast.error(errorMsg);
        return;
      }

      const skipDetail = skippedCount > 0 ? `skipped ${skippedCount} (${skippedTitles.join(', ')})` : 'skipped 0';

      if (failedCount > 0) {
        const failDetail = `failed ${failedCount} (${failedTitles.join(', ')})`;
        const resultMsg = `Created ${createdCount}, ${skipDetail}, ${failDetail}.`;
        setStatus({ type: 'error', message: resultMsg });
        toast.error(resultMsg);
      } else {
        let resultMsg: string;
        if (createdCount === 0) {
          resultMsg = `All runsheets already exist. Created 0, ${skipDetail}, failed 0.`;
        } else {
          resultMsg = `Created ${createdCount}, ${skipDetail}, failed 0.`;
        }
        setStatus({ type: 'success', message: resultMsg });
        toast.success(resultMsg);
      }

      if (onCreated) {
        if (firstCreated) {
          if (firstCreated.rosterData !== undefined) {
            onCreated(firstCreated.id, firstCreated.title, firstCreated.data, firstCreated.rosterData);
          } else {
            onCreated(firstCreated.id, firstCreated.title, firstCreated.data);
          }
        } else if (firstSkipped) {
          let openId = firstSkipped.id;
          if (!openId) {
            try {
              const channelsRes = await rockGetAvailableRunsheetChannels(true);
              if (channelsRes.success && channelsRes.channels) {
                const match = channelsRes.channels.find((c) => c.name === firstSkipped!.title);
                if (match) {
                  openId = match.id;
                }
              }
            } catch (err) {
              console.warn('Failed to resolve channel ID for skipped runsheet:', err);
            }
          }
          if (openId) {
            onCreated(openId, firstSkipped.title);
          }
        }
      }
      return;
    }

    const res = await rockCreateServiceRunsheet(
      finalTitle,
      Number(selectedTypeId || 13),
      Number(selectedCategoryId)
    );

    if (res.success && res.id) {
      const successMsg = `Successfully created "${finalTitle}"!`;
      setStatus({
        type: 'success',
        message: successMsg,
      });
      toast.success(successMsg);

      // Automatically load into editor
      if (onCreated) {
        if (res.rosterData !== undefined) {
          onCreated(res.id, finalTitle, res.data, res.rosterData);
        } else {
          onCreated(res.id, finalTitle, res.data);
        }
      }
    } else {
      const errorMsg = res.error || 'Unknown error';
      setStatus({ type: 'error', message: errorMsg });
      toast.error(errorMsg);
    }
  };

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Create New Runsheet</h2>

      {status.type === 'success' && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 border border-emerald-200">
          {status.message}
        </div>
      )}

      {status.type === 'error' && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm font-semibold text-rose-800 border border-rose-200">
          {status.message}
        </div>
      )}

      {loadingOptions ? (
        <div className="py-8 text-center text-sm font-medium text-slate-500">
          Loading options from Rock RMS...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="category-select" className="mb-1 block text-sm font-semibold text-slate-700">
              Category
            </label>
            <select
              id="category-select"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={selectedCategoryId}
              onChange={(e) => {
                userEditedDateRef.current = false;
                setSelectedCategoryId(e.target.value ? Number(e.target.value) : '');
              }}
            >
              {categories.length === 0 && <option value="" disabled>No Categories Available</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="date-input" className="mb-1 block text-sm font-semibold text-slate-700">
              Date
            </label>
            <input
              id="date-input"
              type="date"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={date}
              onChange={(e) => {
                userEditedDateRef.current = true;
                setDate(e.target.value);
              }}
            />
          </div>

          <div>
            <label htmlFor="session-select" className="mb-1 block text-sm font-semibold text-slate-700">
              Session / Service Schedule
            </label>
            <select
              id="session-select"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
              value={session}
              disabled={loadingSchedules}
              onChange={(e) => setSession(e.target.value)}
            >
              {loadingSchedules ? (
                <option value="">Loading schedules...</option>
              ) : schedules.length > 0 ? (
                schedules.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({s.timeLabel})
                  </option>
                ))
              ) : (
                <>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                  <option value="All Day">All Day</option>
                </>
              )}
            </select>
          </div>

          {/* Date-wide batch creation */}
          {dateSchedules.length >= 2 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchCreateDateWide}
                  onChange={(e) => {
                    setBatchCreateDateWide(e.target.checked);
                    if (e.target.checked) setBatchCreateUpcoming(false);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800">
                    Create runsheets for all {dateSchedules.length} sessions on this date
                  </span>
                  <p className="mt-0.5 text-slate-500">
                    Creates a runsheet for each {selectedSchedule && sessionBaseName(selectedSchedule.name)} session on {formatDateToWordy(date)}: {dateSchedules.map((s) => s.timeLabel || s.name).join(', ')}.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Batch creation for Grow course */}
          {isGrowSchedule && (selectedSchedule?.upcomingOccurrences?.length ?? 0) >= 2 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchCreateUpcoming}
                  onChange={(e) => {
                    setBatchCreateUpcoming(e.target.checked);
                    if (e.target.checked) setBatchCreateDateWide(false);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800">
                    Also create runsheets for all upcoming sessions of this course
                  </span>
                  <span className="ml-1 font-medium text-slate-500">
                    ({selectedSchedule.upcomingOccurrences?.length} sessions)
                  </span>
                  <p className="mt-0.5 text-slate-500">
                    Creates runsheets for each scheduled date of &quot;{selectedSchedule.name}&quot;.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Batch creation for non-Grow schedule */}
          {!isGrowSchedule && nonGrowUpcomingOccurrences.length >= 2 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchCreateUpcoming}
                  onChange={(e) => {
                    setBatchCreateUpcoming(e.target.checked);
                    if (e.target.checked) setBatchCreateDateWide(false);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800">
                    Also create runsheets for upcoming sessions
                  </span>
                  <span className="ml-1 font-medium text-slate-500">
                    ({nonGrowUpcomingOccurrences.length} sessions available)
                  </span>
                  <p className="mt-0.5 text-slate-500">
                    Creates runsheets for upcoming dates of &quot;{selectedSchedule?.name}&quot;.
                  </p>
                </div>
              </label>
              <div className="mt-2.5 ml-6 flex items-center gap-2">
                <label htmlFor="upcoming-sessions-count" className="text-xs font-medium text-slate-700">
                  Number of upcoming sessions:
                </label>
                <input
                  id="upcoming-sessions-count"
                  aria-label="Upcoming sessions count"
                  type="number"
                  min={1}
                  max={nonGrowUpcomingOccurrences.length || 1}
                  value={upcomingCount}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const max = nonGrowUpcomingOccurrences.length || 1;
                    if (isNaN(raw)) {
                      setUpcomingCount(1);
                    } else {
                      setUpcomingCount(Math.min(Math.max(1, raw), max));
                    }
                  }}
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Runsheet Title
            </label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="mt-1 text-xs font-medium text-red-600">
              Auto-generated from session & date. You can edit this title directly if needed.
            </p>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={status.type === 'loading'}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status.type === 'loading'}
              className="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {status.type === 'loading'
                ? 'Saving...'
                : batchCreateDateWide
                  ? `Create All (${dateSchedules.length}) Runsheets`
                  : batchCreateUpcoming
                    ? isGrowSchedule
                      ? `Create All (${selectedSchedule?.upcomingOccurrences?.length || 0}) Runsheets`
                      : `Create All (${Math.min(Math.max(1, upcomingCount), nonGrowUpcomingOccurrences.length || 1)}) Runsheets`
                    : 'Save Runsheet'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
