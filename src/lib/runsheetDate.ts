/**
 * Date parsing utilities for runsheet channel names and titles.
 */

export function extractChannelDate(name: string): Date | null {
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const m1 = name.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m1) {
    const month = months[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    return new Date(year, month, day);
  }

  const m2 = name.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    const month = parseInt(m2[1], 10) - 1;
    const day = parseInt(m2[2], 10);
    const year = parseInt(m2[3], 10);
    return new Date(year, month, day);
  }

  const m3 = name.match(/(\d{1,2})\/(\d{1,2})/);
  if (m3) {
    const currentYear = new Date().getFullYear();
    const month = parseInt(m3[1], 10) - 1;
    const day = parseInt(m3[2], 10);
    return new Date(currentYear, month, day);
  }

  const m4 = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m4) {
    const year = parseInt(m4[1], 10);
    const month = parseInt(m4[2], 10) - 1;
    const day = parseInt(m4[3], 10);
    return new Date(year, month, day);
  }

  return null;
}

/** Converts a time string (e.g. "10AM", "11:30AM", "5PM", "9:00 AM", "17:30") into a 24-hour sortable signature "HH:MM:SS". */
export function parseTimeToSortSignature(timeStr: string): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();

  // 1. Matches 12-hour: 9AM, 9:30AM, 09:30 AM, 11:30 PM, 5pm, 10:00:00 AM, 10:00AM
  const m12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let hours = parseInt(m12[1], 10);
    const minutes = parseInt(m12[2] || '0', 10);
    const seconds = parseInt(m12[3] || '0', 10);
    const period = m12[4].toUpperCase();

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // 2. Matches 24-hour formats: 14:30, 09:00, 17:30:00
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hours = parseInt(m24[1], 10);
    const minutes = parseInt(m24[2], 10);
    const seconds = parseInt(m24[3] || '0', 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }

  // 3. Fallback for bare AM / PM
  if (/^AM$/i.test(trimmed)) return '09:00:00';
  if (/^PM$/i.test(trimmed)) return '17:00:00';

  return '';
}

/** Reads the trailing `{time}` segment off a channel name, e.g. `"...// 11:30AM"` → `"11:30AM"`. */
export function extractChannelTime(name: string): string {
  if (!name) return '';
  const parts = name.split('//').map((p) => p.trim());
  if (parts.length >= 3) {
    return parts[parts.length - 1];
  }
  if (parts.length === 2) {
    const secondPart = parts[1];
    if (parseTimeToSortSignature(secondPart) && !extractChannelDate(secondPart)) {
      return secondPart;
    }
    return '';
  }
  if (parts.length === 1 && parseTimeToSortSignature(parts[0])) {
    return parts[0];
  }
  return '';
}

/** Formats a runsheet channel's date into a clean display string, e.g. `"Sun, Aug 9, 2026"`. */
export function formatChannelDateDisplay(name: string): string {
  const dt = extractChannelDate(name);
  if (dt) {
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const parts = name.split('//').map((p) => p.trim());
  if (parts.length >= 3) {
    return parts[1];
  }
  return '';
}

/** Formats a runsheet channel's date into a sortable ISO string `YYYY-MM-DD`. */
export function formatChannelDateSortKey(nameOrDate: string | Date | null): string {
  if (!nameOrDate) return '9999-99-99';
  const dt = typeof nameOrDate === 'string' ? extractChannelDate(nameOrDate) : nameOrDate;
  if (!dt || isNaN(dt.getTime())) return '9999-99-99';
  const y = String(dt.getFullYear()).padStart(4, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Extracts the title / location prefix from a runsheet name, e.g. `"MNL Crowne // Aug 9 // 10AM"` → `"MNL Crowne"`. */
export function extractChannelTitleDisplay(name: string): string {
  const parts = name.split('//').map((p) => p.trim());
  if (parts.length >= 2) {
    return parts[0];
  }
  return name;
}

/** Builds a sortable signature string combining date, time signature, and channel title. */
export function getRunsheetSortSignature(channel: { name: string; time?: string }): string {
  const dateKey = formatChannelDateSortKey(channel.name);
  const timeRaw = channel.time || extractChannelTime(channel.name);
  const timeSig = parseTimeToSortSignature(timeRaw) || '99:99:99';
  const title = extractChannelTitleDisplay(channel.name).toLowerCase();
  return `${dateKey}_${timeSig}_${title}`;
}

/** Compares two runsheet channels by date, sortable time signature, title, and ID. */
export function compareRunsheetChannels(
  a: { id?: number; name: string; time?: string },
  b: { id?: number; name: string; time?: string }
): number {
  const sigA = getRunsheetSortSignature(a);
  const sigB = getRunsheetSortSignature(b);
  const cmp = sigA.localeCompare(sigB);
  if (cmp !== 0) return cmp;
  return (a.id ?? 0) - (b.id ?? 0);
}

/** Returns a new sorted array of runsheet channels ordered chronologically by date and time signature. */
export function sortRunsheetChannels<T extends { id?: number; name: string; time?: string }>(
  channels: T[]
): T[] {
  return [...channels].sort(compareRunsheetChannels);
}
