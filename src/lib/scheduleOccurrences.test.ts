import { describe, expect, it } from '@jest/globals';
import { expandIcalOccurrences, formatIcalTime } from './scheduleOccurrences';

const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

describe('formatIcalTime', () => {
  it('formats whole and half hours', () => {
    expect(formatIcalTime('190000')).toBe('7PM');
    expect(formatIcalTime('083000')).toBe('8:30AM');
    expect(formatIcalTime('120000')).toBe('12PM');
    expect(formatIcalTime('000000')).toBe('12AM');
  });
});

describe('expandIcalOccurrences', () => {
  it('returns a single-date schedule', () => {
    const ical = wrap('DTSTART:20260808T090000\r\nRDATE:20260808T090000');
    expect(expandIcalOccurrences(ical, '2026-08-01')).toEqual([{ date: '2026-08-08', time: '9AM' }]);
  });

  it('includes DTSTART plus every RDATE, skipping past dates', () => {
    const ical = wrap('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000,20261020T190000');
    expect(expandIcalOccurrences(ical, '2026-10-01').map((o) => o.date)).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
    ]);
  });

  it('expands a weekly RRULE until UNTIL', () => {
    const ical = wrap('DTSTART:20260927T150000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261018T000000;BYDAY=SU');
    expect(expandIcalOccurrences(ical, '2026-09-26')).toEqual([
      { date: '2026-09-27', time: '3PM' },
      { date: '2026-10-04', time: '3PM' },
      { date: '2026-10-11', time: '3PM' },
      { date: '2026-10-18', time: '3PM' },
    ]);
  });

  it('honours COUNT, INTERVAL and multi-day BYDAY', () => {
    const ical = wrap('DTSTART:20261005T190000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=MO,WE');
    expect(expandIcalOccurrences(ical, '2026-01-01').map((o) => o.date)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-19',
      '2026-10-21',
    ]);
  });

  it('caps at the effective end date and the limit', () => {
    const ical = wrap('DTSTART:20260927T150000\r\nRRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(expandIcalOccurrences(ical, '2026-09-26', '2026-10-05T00:00:00').map((o) => o.date)).toEqual([
      '2026-09-27',
      '2026-10-04',
    ]);
    expect(expandIcalOccurrences(ical, '2026-09-26', null, 3)).toHaveLength(3);
  });

  it('returns [] for content with no DTSTART', () => {
    expect(expandIcalOccurrences('', '2026-01-01')).toEqual([]);
  });
});
