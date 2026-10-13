import {
  extractChannelDate,
  extractChannelTime,
  formatChannelDateDisplay,
  formatChannelDateSortKey,
  extractChannelTitleDisplay,
  parseTimeToSortSignature,
  getRunsheetSortSignature,
  compareRunsheetChannels,
  sortRunsheetChannels,
  partitionRunsheetChannelsByRecency,
} from '@/lib/runsheetDate';

const ymd = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);

describe('runsheetDate', () => {
  describe('extractChannelDate', () => {
    it('reads long and short month names, with or without the comma, in any case', () => {
      expect(ymd(extractChannelDate('MNL Crowne // August 9, 2026 // 10AM'))).toEqual([2026, 8, 9]);
      expect(ymd(extractChannelDate('MNL // sep 20 2026'))).toEqual([2026, 9, 20]);
      expect(ymd(extractChannelDate('MNL // DEC 31, 2025'))).toEqual([2025, 12, 31]);
    });

    it('reads M/D/YYYY with one- or two-digit month and day', () => {
      expect(ymd(extractChannelDate('MNL // 12/25/2031'))).toEqual([2031, 12, 25]);
      expect(ymd(extractChannelDate('MNL // 1/5/2031'))).toEqual([2031, 1, 5]);
      expect(ymd(extractChannelDate('MNL // 8/16/2026 // 10AM'))).toEqual([2026, 8, 16]);
    });

    it('reads M/D without a year as the current year', () => {
      const year = new Date().getFullYear();
      expect(ymd(extractChannelDate('MNL // 12/25'))).toEqual([year, 12, 25]);
      expect(ymd(extractChannelDate('MNL // 3/7'))).toEqual([year, 3, 7]);
    });

    it('reads ISO YYYY-MM-DD', () => {
      expect(ymd(extractChannelDate('MNL // 2026-11-25'))).toEqual([2026, 11, 25]);
    });

    it('returns null when there is no date', () => {
      expect(extractChannelDate('Master Template')).toBeNull();
    });
  });

  describe('formatChannelDateDisplay', () => {
    it('formats a parsed date', () => {
      expect(formatChannelDateDisplay('MNL Crowne // August 9, 2026 // 10AM')).toBe('Sun, Aug 9, 2026');
    });

    it('falls back to the middle segment of a 3-part name with no parseable date', () => {
      expect(formatChannelDateDisplay('MNL // Easter // 10AM')).toBe('Easter');
    });

    it('returns empty for names with fewer than 3 parts and no date', () => {
      expect(formatChannelDateDisplay('MNL // Easter')).toBe('');
      expect(formatChannelDateDisplay('Master Template')).toBe('');
    });
  });

  describe('extractChannelTitleDisplay', () => {
    it('returns the first segment, or the whole name when unsegmented', () => {
      expect(extractChannelTitleDisplay('MNL Crowne // August 9, 2026 // 10AM')).toBe('MNL Crowne');
      expect(extractChannelTitleDisplay('MNL Crowne // 10AM')).toBe('MNL Crowne');
      expect(extractChannelTitleDisplay('Master Template')).toBe('Master Template');
    });
  });

  describe('parseTimeToSortSignature', () => {
    it.each([
      ['9AM', '09:00:00'],
      ['9:00 AM', '09:00:00'],
      ['9:30AM', '09:30:00'],
      ['11:30AM', '11:30:00'],
      ['10:00:15 AM', '10:00:15'],
      ['12PM', '12:00:00'],
      ['12:30PM', '12:30:00'],
      ['1PM', '13:00:00'],
      ['1:30 pm', '13:30:00'],
      ['11PM', '23:00:00'],
      ['12AM', '00:00:00'],
      ['12:30am', '00:30:00'],
      ['  5PM  ', '17:00:00'],
    ])('converts 12-hour %p to %p', (input, expected) => {
      expect(parseTimeToSortSignature(input)).toBe(expected);
    });

    it.each([
      ['0:00', '00:00:00'],
      ['09:00', '09:00:00'],
      ['14:30', '14:30:00'],
      ['17:00:00', '17:00:00'],
      ['23:59:59', '23:59:59'],
    ])('converts 24-hour %p to %p', (input, expected) => {
      expect(parseTimeToSortSignature(input)).toBe(expected);
    });

    it.each(['24:00', '12:60', '12:00:60', '99:99'])('rejects out-of-range 24-hour %p', (input) => {
      expect(parseTimeToSortSignature(input)).toBe('');
    });

    it('maps bare AM / PM to morning and evening defaults', () => {
      expect(parseTimeToSortSignature('AM')).toBe('09:00:00');
      expect(parseTimeToSortSignature('pm')).toBe('17:00:00');
    });

    it.each(['', 'random text', 'x9AM', '9AMx', 'at 14:30', '14:30 sharp', 'AM service', 'PMs', 'xPM'])(
      'returns empty for %p',
      (input) => {
        expect(parseTimeToSortSignature(input)).toBe('');
      },
    );
  });

  describe('extractChannelTime', () => {
    it('returns the last segment of a 3+ part name', () => {
      expect(extractChannelTime('MNL Crowne // August 9, 2026 // 10AM')).toBe('10AM');
      expect(extractChannelTime('SEL Service // August 16, 2026 // 11:30AM')).toBe('11:30AM');
      expect(extractChannelTime('A // B // C // 5PM')).toBe('5PM');
    });

    it('returns the second segment of a 2-part name only when it is a time, not a date', () => {
      expect(extractChannelTime('MNL Crowne // 10AM')).toBe('10AM');
      expect(extractChannelTime('MNL Crowne // August 9, 2026')).toBe('');
      expect(extractChannelTime('MNL Crowne // 2026-08-09')).toBe('');
    });

    it('returns a bare time name, and empty otherwise', () => {
      expect(extractChannelTime('10AM')).toBe('10AM');
      expect(extractChannelTime('Master Template')).toBe('');
      expect(extractChannelTime('')).toBe('');
    });
  });

  describe('formatChannelDateSortKey', () => {
    it('formats names and Date objects as zero-padded YYYY-MM-DD', () => {
      expect(formatChannelDateSortKey('MNL Crowne // August 9, 2026 // 10AM')).toBe('2026-08-09');
      expect(formatChannelDateSortKey('MNL Crowne // 2026-11-25 // 10AM')).toBe('2026-11-25');
      expect(formatChannelDateSortKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('sorts unparseable, null, and invalid dates last', () => {
      expect(formatChannelDateSortKey('No Date Channel')).toBe('9999-99-99');
      expect(formatChannelDateSortKey(null)).toBe('9999-99-99');
      expect(formatChannelDateSortKey(new Date('nope'))).toBe('9999-99-99');
    });
  });

  describe('getRunsheetSortSignature', () => {
    it('combines date, time and lowercased title', () => {
      expect(getRunsheetSortSignature({ name: 'MNL Crowne // August 9, 2026 // 9AM' })).toBe(
        '2026-08-09_09:00:00_mnl crowne',
      );
    });

    it('prefers an explicit time over the name and sorts unknown times last', () => {
      expect(getRunsheetSortSignature({ name: 'MNL // August 9, 2026 // 9AM', time: '5PM' })).toBe(
        '2026-08-09_17:00:00_mnl',
      );
      expect(getRunsheetSortSignature({ name: 'MNL // August 9, 2026 // TBA' })).toBe('2026-08-09_99:99:99_mnl');
    });
  });

  describe('compareRunsheetChannels', () => {
    it('orders by time within a day', () => {
      const a = { id: 1, name: 'MNL Crowne // August 9, 2026 // 10AM' };
      const b = { id: 2, name: 'MNL Crowne // August 9, 2026 // 5PM' };
      expect(compareRunsheetChannels(a, b)).toBeLessThan(0);
      expect(compareRunsheetChannels(b, a)).toBeGreaterThan(0);
    });

    it('breaks exact ties by id, treating a missing id as 0', () => {
      const name = 'MNL // August 9, 2026 // 10AM';
      expect(compareRunsheetChannels({ id: 7, name }, { id: 3, name })).toBe(4);
      expect(compareRunsheetChannels({ name }, { id: 3, name })).toBe(-3);
      expect(compareRunsheetChannels({ id: 3, name }, { name })).toBe(3);
    });
  });

  describe('sortRunsheetChannels', () => {
    const channels = [
      { id: 1, name: 'MNL Crowne // August 16, 2026 // 5PM' },
      { id: 2, name: 'MNL Crowne // August 16, 2026 // 9AM' },
      { id: 3, name: 'MNL Crowne // August 16, 2026 // 11:30AM' },
      { id: 4, name: 'MNL Crowne // August 16, 2026 // 10AM' },
      { id: 5, name: 'BNE Service // August 9, 2026 // 5PM' },
      { id: 6, name: 'MNL Crowne // August 9, 2026 // 10AM' },
    ];

    it('sorts ascending by date then time by default without mutating the input', () => {
      expect(sortRunsheetChannels(channels).map((c) => c.id)).toEqual([6, 5, 2, 4, 3, 1]);
      expect(channels[0].id).toBe(1);
    });

    it('sorts descending when asked', () => {
      expect(sortRunsheetChannels(channels, 'desc').map((c) => c.id)).toEqual([1, 3, 4, 2, 5, 6]);
    });
  });

  describe('partitionRunsheetChannelsByRecency', () => {
    const channels = [
      { id: 1, name: 'MNL Crowne // September 20, 2026 // 3PM' },
      { id: 2, name: 'MNL Crowne // September 27, 2026 // 3PM' },
      { id: 3, name: 'MNL Crowne // October 4, 2026 // 3PM' },
    ];

    it('splits on today, counting today as upcoming even late in the day', () => {
      const { upcoming, past } = partitionRunsheetChannelsByRecency(channels, new Date(2026, 8, 27, 23, 59));
      expect(upcoming.map((c) => c.id)).toEqual([2, 3]);
      expect(past.map((c) => c.id)).toEqual([1]);
    });

    it('treats an undated channel as upcoming', () => {
      const { upcoming, past } = partitionRunsheetChannelsByRecency(
        [{ id: 9, name: 'Master Template' }],
        new Date(2026, 8, 27),
      );
      expect(upcoming.map((c) => c.id)).toEqual([9]);
      expect(past).toEqual([]);
    });
  });
});
