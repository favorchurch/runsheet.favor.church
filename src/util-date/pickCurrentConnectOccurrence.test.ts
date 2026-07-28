import { pickCurrentConnectOccurrence } from './pickCurrentConnectOccurrence';

// Minimal occurrence factory — only the field the picker reads.
const occ = (id: number, OccurrenceDate: string | null) => ({ id, OccurrenceDate });

describe('pickCurrentConnectOccurrence', () => {
  const now = new Date('2026-07-07T12:00:00.000Z'); // a Tuesday

  it('returns undefined for an empty list', () => {
    expect(pickCurrentConnectOccurrence([], now)).toBeUndefined();
  });

  it('picks the occurrence nearest to now across a 2-week window', () => {
    // Regression: ascending + $top:1 returned the OLDEST (last week), showing "N weeks ago".
    const lastWeek = occ(1, '2026-06-29T00:00:00.000Z'); // ~8 days ago
    const thisWeek = occ(2, '2026-07-06T00:00:00.000Z'); // ~1.5 days ago
    const result = pickCurrentConnectOccurrence([lastWeek, thisWeek], now);
    expect(result?.id).toBe(2);
  });

  it('picks the nearest even when input is unordered and includes a future occurrence', () => {
    const nextWeek = occ(3, '2026-07-13T00:00:00.000Z'); // ~5.5 days ahead
    const thisWeek = occ(2, '2026-07-06T00:00:00.000Z'); // ~1.5 days ago
    const result = pickCurrentConnectOccurrence([nextWeek, thisWeek], now);
    expect(result?.id).toBe(2);
  });

  it('prefers the most recent past occurrence on a tie', () => {
    const past = occ(1, '2026-07-06T12:00:00.000Z'); // exactly 1 day before
    const future = occ(2, '2026-07-08T12:00:00.000Z'); // exactly 1 day after
    const result = pickCurrentConnectOccurrence([future, past], now);
    expect(result?.id).toBe(1);
  });

  it('ignores rows with a missing or invalid OccurrenceDate', () => {
    const valid = occ(1, '2026-07-06T00:00:00.000Z');
    const missing = occ(2, null);
    const invalid = occ(3, 'not-a-date');
    const result = pickCurrentConnectOccurrence([missing, invalid, valid], now);
    expect(result?.id).toBe(1);
  });

  it('returns undefined when no row has a usable date', () => {
    expect(pickCurrentConnectOccurrence([occ(1, null), occ(2, 'garbage')], now)).toBeUndefined();
  });
});
