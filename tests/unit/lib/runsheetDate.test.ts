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
} from '@/lib/runsheetDate';

describe('runsheetDate', () => {
  describe('extractChannelDate and formatChannelDateDisplay', () => {
    it('extracts date and formats display correctly', () => {
      const dt = extractChannelDate('MNL Crowne // August 9, 2026 // 10AM');
      expect(dt).not.toBeNull();
      expect(dt?.getFullYear()).toBe(2026);
      expect(dt?.getMonth()).toBe(7); // August = 7 (0-indexed)
      expect(dt?.getDate()).toBe(9);

      const display = formatChannelDateDisplay('MNL Crowne // August 9, 2026 // 10AM');
      expect(display).toContain('Aug 9, 2026');

      const title = extractChannelTitleDisplay('MNL Crowne // August 9, 2026 // 10AM');
      expect(title).toBe('MNL Crowne');
    });
  });

  describe('compareRunsheetChannels', () => {
    it('returns negative when a is earlier than b', () => {
      const a = { id: 1, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' };
      const b = { id: 2, name: 'MNL Crowne // August 9, 2026 // 5PM', time: '5PM' };
      expect(compareRunsheetChannels(a, b)).toBeLessThan(0);
      expect(compareRunsheetChannels(b, a)).toBeGreaterThan(0);
    });
  });
  describe('parseTimeToSortSignature', () => {
    it('converts various 12-hour AM/PM formats into 24-hour sortable signatures', () => {
      expect(parseTimeToSortSignature('9AM')).toBe('09:00:00');
      expect(parseTimeToSortSignature('9:00 AM')).toBe('09:00:00');
      expect(parseTimeToSortSignature('9:30AM')).toBe('09:30:00');
      expect(parseTimeToSortSignature('10AM')).toBe('10:00:00');
      expect(parseTimeToSortSignature('10:00AM')).toBe('10:00:00');
      expect(parseTimeToSortSignature('10:00 AM')).toBe('10:00:00');
      expect(parseTimeToSortSignature('11:30AM')).toBe('11:30:00');
      expect(parseTimeToSortSignature('12PM')).toBe('12:00:00');
      expect(parseTimeToSortSignature('12:00 PM')).toBe('12:00:00');
      expect(parseTimeToSortSignature('12:30PM')).toBe('12:30:00');
      expect(parseTimeToSortSignature('1PM')).toBe('13:00:00');
      expect(parseTimeToSortSignature('1:30 PM')).toBe('13:30:00');
      expect(parseTimeToSortSignature('5PM')).toBe('17:00:00');
      expect(parseTimeToSortSignature('5:30 PM')).toBe('17:30:00');
      expect(parseTimeToSortSignature('12AM')).toBe('00:00:00');
      expect(parseTimeToSortSignature('12:30AM')).toBe('00:30:00');
    });

    it('converts 24-hour format times', () => {
      expect(parseTimeToSortSignature('09:00')).toBe('09:00:00');
      expect(parseTimeToSortSignature('14:30')).toBe('14:30:00');
      expect(parseTimeToSortSignature('17:00:00')).toBe('17:00:00');
    });

    it('handles bare AM / PM fallback', () => {
      expect(parseTimeToSortSignature('AM')).toBe('09:00:00');
      expect(parseTimeToSortSignature('PM')).toBe('17:00:00');
    });

    it('returns empty string for invalid or empty input', () => {
      expect(parseTimeToSortSignature('')).toBe('');
      expect(parseTimeToSortSignature('random text')).toBe('');
    });
  });

  describe('extractChannelTime', () => {
    it('extracts time from a 3-part channel name', () => {
      expect(extractChannelTime('MNL Crowne // August 9, 2026 // 10AM')).toBe('10AM');
      expect(extractChannelTime('BNE Service // August 9, 2026 // 5PM')).toBe('5PM');
      expect(extractChannelTime('SEL Service // August 16, 2026 // 11:30AM')).toBe('11:30AM');
    });

    it('does not confuse date for time in 2-part channel names', () => {
      expect(extractChannelTime('MNL Crowne // August 9, 2026')).toBe('');
      expect(extractChannelTime('MNL Crowne // 2026-08-09')).toBe('');
    });

    it('extracts time from 2-part channel names when 2nd part is actually a time', () => {
      expect(extractChannelTime('MNL Crowne // 10AM')).toBe('10AM');
    });
  });

  describe('formatChannelDateSortKey', () => {
    it('formats date into sortable YYYY-MM-DD string', () => {
      expect(formatChannelDateSortKey('MNL Crowne // August 9, 2026 // 10AM')).toBe('2026-08-09');
      expect(formatChannelDateSortKey('MNL Crowne // 2026-11-25 // 10AM')).toBe('2026-11-25');
      expect(formatChannelDateSortKey('MNL Crowne // 8/16/2026 // 10AM')).toBe('2026-08-16');
    });

    it('falls back to 9999-99-99 when date cannot be parsed', () => {
      expect(formatChannelDateSortKey('No Date Channel')).toBe('9999-99-99');
    });
  });

  describe('getRunsheetSortSignature', () => {
    it('generates a composite sortable signature', () => {
      expect(getRunsheetSortSignature({ name: 'MNL Crowne // August 9, 2026 // 10AM' })).toBe(
        '2026-08-09_10:00:00_mnl crowne',
      );
      expect(getRunsheetSortSignature({ name: 'MNL Crowne // August 9, 2026 // 9AM' })).toBe(
        '2026-08-09_09:00:00_mnl crowne',
      );
      expect(getRunsheetSortSignature({ name: 'MNL Crowne // August 9, 2026 // 5PM' })).toBe(
        '2026-08-09_17:00:00_mnl crowne',
      );
    });
  });

  describe('sortRunsheetChannels', () => {
    it('correctly sorts runsheet channels by date and sortable time signature', () => {
      const channels = [
        { id: 1, name: 'MNL Crowne // August 16, 2026 // 5PM', time: '5PM' },
        { id: 2, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
        { id: 3, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
        { id: 4, name: 'MNL Crowne // August 16, 2026 // 10AM', time: '10AM' },
        { id: 5, name: 'BNE Service // August 9, 2026 // 5PM', time: '5PM' },
        { id: 6, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' },
      ];

      const sorted = sortRunsheetChannels(channels);

      expect(sorted.map((c) => c.id)).toEqual([6, 5, 2, 4, 3, 1]);
    });
  });
});
