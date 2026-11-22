import { runsheetRowsMatch } from '@/lib/runsheetRowsMatch';
import type { RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, extra: Partial<RunsheetItemRow> = {}): RunsheetItemRow {
  return {
    id,
    title,
    order: id,
    duration: 5,
    attributeValues: { ACTIVITYTITLE: title, DESCRIPTION: `${title} notes` },
    ...extra,
  };
}

describe('runsheetRowsMatch', () => {
  const rows = [row(1, 'Welcome'), row(2, 'Worship'), row(3, 'Message')];

  it('matches identical rows', () => {
    expect(runsheetRowsMatch(rows, rows.map((r) => ({ ...r })))).toBe(true);
  });

  it('detects a changed cell, so a stale screen is not mistaken for current', () => {
    const rock = [row(1, 'Welcome'), row(2, 'Worship', { attributeValues: { ACTIVITYTITLE: 'Worship', DESCRIPTION: 'new notes' } }), row(3, 'Message')];
    expect(runsheetRowsMatch(rows, rock)).toBe(false);
  });

  it('detects a changed title, duration or linked song', () => {
    expect(runsheetRowsMatch(rows, [row(1, 'Welcome back'), rows[1], rows[2]])).toBe(false);
    expect(runsheetRowsMatch(rows, [rows[0], row(2, 'Worship', { duration: 9 }), rows[2]])).toBe(false);
    expect(runsheetRowsMatch(rows, [rows[0], row(2, 'Worship', { songItemId: 77 }), rows[2]])).toBe(false);
  });

  it('detects reordered, added and removed rows', () => {
    expect(runsheetRowsMatch(rows, [rows[1], rows[0], rows[2]])).toBe(false);
    expect(runsheetRowsMatch(rows, [...rows, row(4, 'Close')])).toBe(false);
    expect(runsheetRowsMatch(rows, rows.slice(0, 2))).toBe(false);
  });

  it('treats a missing attribute and an empty one as the same', () => {
    const withBlank = [row(1, 'Welcome', { attributeValues: { ACTIVITYTITLE: 'Welcome', DESCRIPTION: 'Welcome notes', LIGHTING: '' } }), rows[1], rows[2]];
    expect(runsheetRowsMatch(rows, withBlank)).toBe(true);
  });

  it('falls back to the plain title when there is no ACTIVITYTITLE attribute', () => {
    const plain = { id: 9, title: 'Offering', order: 9, duration: 5, attributeValues: {} } as RunsheetItemRow;
    expect(runsheetRowsMatch([plain], [{ ...plain }])).toBe(true);
    expect(runsheetRowsMatch([plain], [{ ...plain, title: 'Giving' }])).toBe(false);
  });

  it('ignores Roster rows and derived start time / order', () => {
    const rosterOnScreen = { id: 50, title: 'Roster: Music Director', order: -100, duration: 0, attributeValues: { PLATFORM: 'Mirrored name' } } as RunsheetItemRow;
    const rosterStored = { ...rosterOnScreen, attributeValues: { PLATFORM: '' } };
    const shifted = rows.map((r) => ({ ...r, order: r.order + 10, startDateTime: '9:00:00 AM' }));
    expect(runsheetRowsMatch([...rows, rosterOnScreen], [...shifted, rosterStored])).toBe(true);
  });
});
