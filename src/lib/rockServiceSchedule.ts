/**
 * Resolves a runsheet channel name to one Rock `Schedule` plus an occurrence date.
 *
 * Channel: `MNL Crowne // September 27, 2026 // 3PM`
 * Schedule: `MNL Crowne 3PM` (id 565)
 *
 * A channel resolves only when exactly one schedule matches. No match, several
 * matches, or a non-MNL campus all mean "unlinked", and the roster card falls
 * back to its free-text behaviour.
 */
import { isRockLinkedCampus } from './rockRosterRoles';
import {
  extractChannelDate,
  extractChannelTime,
  extractChannelTitleDisplay,
  parseTimeToSortSignature,
} from './runsheetDate';

export interface RockServiceCandidate {
  scheduleId: number;
  name: string;
}

export interface RockServiceOccurrence {
  scheduleId: number;
  /** `YYYY-MM-DD`, local to the campus. */
  isoDate: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toIsoLocal(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Splits `MNL Crowne // September 27, 2026 // 3PM` into its matchable parts. */
export function parseChannelOccurrence(
  channelName: string,
): { isoDate: string; prefix: string; timeSignature: string } | null {
  if (!isRockLinkedCampus(channelName)) return null;
  const date = extractChannelDate(channelName);
  if (!date || isNaN(date.getTime())) return null;
  const prefix = extractChannelTitleDisplay(channelName).trim();
  if (!prefix) return null;
  return {
    isoDate: toIsoLocal(date),
    prefix,
    timeSignature: parseTimeToSortSignature(extractChannelTime(channelName)),
  };
}

/** Splits `MNL Podium 5:30PM` into `{ prefix: 'MNL Podium', timeSignature: '17:30:00' }`. */
function parseScheduleName(name: string): { prefix: string; timeSignature: string } {
  const m = name.trim().match(/^(.*?)[\s|-]+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))$/i);
  if (!m) return { prefix: name.trim(), timeSignature: '' };
  return { prefix: m[1].trim(), timeSignature: parseTimeToSortSignature(m[2].trim()) };
}

export function matchRockSchedule(
  channelName: string,
  services: RockServiceCandidate[],
): RockServiceOccurrence | null {
  const channel = parseChannelOccurrence(channelName);
  if (!channel) return null;

  const channelPrefix = normalize(channel.prefix);
  const parsed = services.map((s) => ({ service: s, ...parseScheduleName(s.name) }));

  let matches = channel.timeSignature
    ? parsed.filter(
        (p) => normalize(p.prefix) === channelPrefix && p.timeSignature === channel.timeSignature,
      )
    : [];

  if (matches.length === 0) {
    // Time-less schedules such as `MNL Family Night`, whose whole name is the
    // channel's own prefix.
    matches = parsed.filter((p) => !p.timeSignature && normalize(p.service.name) === channelPrefix);
  }

  if (matches.length !== 1) return null;
  return { scheduleId: matches[0].service.scheduleId, isoDate: channel.isoDate };
}
