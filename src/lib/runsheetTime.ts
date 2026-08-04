/**
 * Time and duration formatting for the runsheet grid.
 *
 * Durations are stored in Rock as a number of minutes (the `DURATION`
 * attribute) but are displayed and typed as `HH:MM:SS`, so fractional minutes
 * are meaningful and round-tripped rather than truncated.
 */

const DEFAULT_START_MINUTES = 9 * 60;

/** Parses a `9:00:00 AM`-style clock string into minutes past midnight. */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return DEFAULT_START_MINUTES;

  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return DEFAULT_START_MINUTES;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[4]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Reads the starting clock time off a runsheet's own name, so a new session
 * opens with its Start already set instead of always defaulting to 9:00 AM.
 *
 * Runsheet titles follow `{prefix} // {date} // {time}` (see
 * `generateRunsheetTitle`), with `{time}` compact and space-free — `10AM`,
 * `11:30AM`, `5:30PM`. Falls back to the 9:00 AM default for titles that
 * don't end in a recognizable time (hand-typed titles, "All Day", etc.), so
 * the Start field is still always editable regardless.
 */
export function parseStartTimeFromRunsheetName(name: string): string {
  if (!name) return formatMinutesToTimeWithSeconds(DEFAULT_START_MINUTES);

  const lastSegment = name.split('//').pop()?.trim() ?? '';
  const match = lastSegment.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return formatMinutesToTimeWithSeconds(DEFAULT_START_MINUTES);

  const hours = match[1];
  const minutes = match[2] ?? '00';
  const period = match[3].toUpperCase();

  return formatMinutesToTimeWithSeconds(parseTimeToMinutes(`${hours}:${minutes}:00 ${period}`));
}

/** Renders minutes past midnight as `9:00:00 AM`. */
export function formatMinutesToTimeWithSeconds(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.floor((totalMinutes * 60) % 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ${period}`;
}

/** Renders a duration in minutes as `HH:MM:SS`. */
export function formatDurationToHMS(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '00:00:00';

  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.floor((totalMinutes * 60) % 60);

  return [hours, mins, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * Parses a typed duration into minutes. A bare number is minutes (`5`), two
 * parts are `MM:SS`, three are `HH:MM:SS`.
 */
export function parseDurationInputToMinutes(input: string): number {
  if (!input) return 0;

  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  const parts = trimmed.split(':').map((part) => parseInt(part, 10) || 0);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;

  return 0;
}
