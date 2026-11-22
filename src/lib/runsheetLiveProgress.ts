/**
 * Live service progress: which runsheet segments have already happened and
 * which one is happening now, judged by the campus wall clock against the
 * planned Start/End times in the grid.
 *
 * Planned times only — a service that runs late still greys a segment when its
 * planned end passes. Only a runsheet dated today (in its campus time zone)
 * gets a progress state; past and future runsheets render normally.
 */

import { extractRunsheetCampus } from './runsheetCampus';
import { extractChannelDate } from './runsheetDate';

export type SegmentProgress = 'past' | 'current' | 'upcoming';

/** Wall-clock reading in a campus time zone. */
export interface CampusClock {
  /** `YYYY-MM-DD` in the campus time zone. */
  dateKey: string;
  /** Minutes past local midnight, including fractional seconds. */
  minutes: number;
}

/** The IANA time zone a runsheet's campus runs on, read from its channel name. */
export function getRunsheetTimeZone(channelName: string): string {
  switch (extractRunsheetCampus(channelName)) {
    case 'BNE':
      return 'Australia/Brisbane';
    case 'SEL':
      return 'Asia/Seoul';
    case 'MNL':
    default:
      return 'Asia/Manila';
  }
}

/** Reads `now` as a date and time of day in the given time zone. */
export function readCampusClock(now: Date, timeZone: string): CampusClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';

  return {
    dateKey: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')) + Number(part('second')) / 60,
  };
}

/** The `YYYY-MM-DD` service date in a runsheet's name, or null when it has none. */
export function getRunsheetDateKey(channelName: string): string | null {
  const date = extractChannelDate(channelName);
  if (!date) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Where a segment planned for `[startMinutes, endMinutes)` stands at `clock`.
 * Returns null when the runsheet is not dated `clock`'s day, so callers style
 * nothing. A zero-length span (a lone sub-item) is past once its start passes.
 */
export function getSegmentProgress(
  runsheetDateKey: string | null,
  startMinutes: number,
  endMinutes: number,
  clock: CampusClock | null,
): SegmentProgress | null {
  if (!clock || !runsheetDateKey || runsheetDateKey !== clock.dateKey) return null;
  if (clock.minutes >= endMinutes) return 'past';
  if (clock.minutes >= startMinutes) return 'current';
  return 'upcoming';
}
