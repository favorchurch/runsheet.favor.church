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

/** Reads the trailing `{time}` segment off a channel name, e.g. `"...// 11:30AM"` → `"11:30AM"`. */
export function extractChannelTime(name: string): string {
  const lastSegment = name.split('//').pop()?.trim() ?? '';
  return lastSegment;
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

/** Extracts the title / location prefix from a runsheet name, e.g. `"MNL Crowne // Aug 9 // 10AM"` → `"MNL Crowne"`. */
export function extractChannelTitleDisplay(name: string): string {
  const parts = name.split('//').map((p) => p.trim());
  if (parts.length >= 2) {
    return parts[0];
  }
  return name;
}
