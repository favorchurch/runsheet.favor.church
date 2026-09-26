/**
 * Expands the iCalendar content Rock stores on a Schedule into concrete
 * occurrence dates. Covers what Rock's schedule editor actually writes:
 * DTSTART, RDATE lists, and WEEKLY/DAILY RRULEs with BYDAY, INTERVAL,
 * UNTIL and COUNT. Dates are handled as plain YYYY-MM-DD strings in UTC
 * arithmetic, so the server timezone never shifts a day.
 */

export interface ScheduleOccurrence {
  date: string;
  time: string;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_RRULE_ITERATIONS = 3660;

/** `"190000"` → `"7PM"`, `"083000"` → `"8:30AM"`. */
export function formatIcalTime(hhmm: string): string {
  const hours = parseInt(hhmm.slice(0, 2), 10) || 0;
  const minutes = parseInt(hhmm.slice(2, 4), 10) || 0;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

function toIsoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function readLines(ical: string, name: string): string[] {
  return ical
    .split(/\r?\n/)
    .filter((line) => line.toUpperCase().startsWith(`${name}:`) || line.toUpperCase().startsWith(`${name};`))
    .map((line) => line.slice(line.indexOf(':') + 1).trim());
}

function parseStamp(value: string): { date: string; time: string } | null {
  const m = value.match(/^(\d{8})(?:T(\d{6}))?/);
  if (!m) return null;
  return { date: toIsoDate(m[1]), time: formatIcalTime(m[2] || '000000') };
}

function expandRrule(rule: string, start: { date: string; time: string }, lastDate: string): ScheduleOccurrence[] {
  const parts = Object.fromEntries(
    rule.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k.toUpperCase(), (v || '').toUpperCase()];
    }),
  );
  const freq = parts.FREQ;
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return [];

  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1);
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : Infinity;
  const until = parts.UNTIL ? toIsoDate(parts.UNTIL) : null;
  const end = until && until < lastDate ? until : lastDate;
  const byDay = (parts.BYDAY ? parts.BYDAY.split(',') : [DAY_CODES[dayOfWeek(start.date)]])
    .map((code: string) => DAY_CODES.indexOf(code.slice(-2)))
    .filter((idx: number) => idx >= 0);

  const out: ScheduleOccurrence[] = [];
  // Weeks are counted from the week containing DTSTART (Sunday-based).
  const weekStart = addDays(start.date, -dayOfWeek(start.date));
  for (let i = 0; i < MAX_RRULE_ITERATIONS && out.length < count; i++) {
    const date = addDays(start.date, i);
    if (date > end) break;
    if (freq === 'DAILY') {
      if (i % interval === 0) out.push({ date, time: start.time });
      continue;
    }
    const weekIndex = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / (7 * 86400000));
    if (weekIndex % interval === 0 && byDay.includes(dayOfWeek(date))) {
      out.push({ date, time: start.time });
    }
  }
  return out;
}

export function expandIcalOccurrences(
  ical: string,
  fromDate: string,
  effectiveEndDate?: string | null,
  limit = 200,
): ScheduleOccurrence[] {
  const start = parseStamp(readLines(ical || '', 'DTSTART')[0] || '');
  if (!start) return [];

  const endFromEffective = effectiveEndDate ? effectiveEndDate.slice(0, 10) : null;
  // Open-ended rules still need a stopping point.
  const lastDate = endFromEffective || addDays(fromDate, 366);

  const all: ScheduleOccurrence[] = [start];
  for (const line of readLines(ical, 'RDATE')) {
    for (const value of line.split(',')) {
      const stamp = parseStamp(value.trim());
      if (stamp) all.push(stamp);
    }
  }
  const rrule = readLines(ical, 'RRULE')[0];
  if (rrule) all.push(...expandRrule(rrule, start, lastDate));

  const byDate = new Map<string, ScheduleOccurrence>();
  for (const occ of all) {
    if (occ.date < fromDate || (endFromEffective && occ.date > endFromEffective)) continue;
    if (!byDate.has(occ.date)) byDate.set(occ.date, occ);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
