import { buildInlineDiffRows, classifyInlineDiffCell, normalizeInlineDiffValue } from '@/lib/runsheetInlineDiff';
import type { RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, values: Record<string, string> = {}, duration = 5): RunsheetItemRow {
  return {
    id,
    title,
    order: id,
    duration,
    attributeValues: { ACTIVITYTITLE: title, ...values },
  };
}

describe('runsheetInlineDiff', () => {
  test('classifies same, changed, removed and added values', () => {
    expect(classifyInlineDiffCell('Same', '<p>Same</p>').status).toBe('same');
    expect(classifyInlineDiffCell('3:00 PM', '5:30 PM').status).toBe('changed');
    expect(classifyInlineDiffCell('Old', '').status).toBe('removed');
    expect(classifyInlineDiffCell('', 'New').status).toBe('added');
  });

  test('matches by SIBLINGKEY even when a row was renamed and moved', () => {
    const source = [row(1, 'Welcome', { SIBLINGKEY: 'stable-key', NOTES: 'Source' })];
    const target = [row(20, 'Renamed Welcome', { SIBLINGKEY: 'stable-key', NOTES: 'Target' })];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [{ id: 10, key: 'NOTES', name: 'Notes' }],
      sourceStartTime: '3:00 PM',
      targetStartTime: '5:30 PM',
    });

    expect(result).toHaveLength(1);
    expect(result[0].rowStatus).toBe('matched');
    expect(result[0].targetRow?.id).toBe(20);
    expect(result[0].cells.NOTES.status).toBe('changed');
    expect(result[0].cells.START.status).toBe('changed');
  });

  test('does not pair ambiguous duplicate titles by position', () => {
    const source = [row(1, 'Song'), row(2, 'Song')];
    const target = [row(10, 'Song'), row(11, 'Song')];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result.filter((entry) => entry.rowStatus === 'source-only')).toHaveLength(2);
    expect(result.filter((entry) => entry.rowStatus === 'target-only')).toHaveLength(2);
  });

  test('inserts a target-only row between its nearest matched neighbors', () => {
    const source = [
      row(1, 'A', { SIBLINGKEY: 'a' }),
      row(2, 'C', { SIBLINGKEY: 'c' }),
    ];
    const target = [
      row(10, 'A', { SIBLINGKEY: 'a' }),
      row(11, 'B', { SIBLINGKEY: 'b' }),
      row(12, 'C', { SIBLINGKEY: 'c' }),
    ];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result.map((entry) => entry.sourceRow?.title || entry.targetRow?.title)).toEqual(['A', 'B', 'C']);
    expect(result[1].rowStatus).toBe('target-only');
    expect(result[1].cells.title.status).toBe('added');
  });

  test('keeps a target-only row after its nearest matched neighbor when that neighbor is at the result end', () => {
    const source = [
      row(1, 'A', { SIBLINGKEY: 'a' }),
      row(2, 'B', { SIBLINGKEY: 'b' }),
      row(3, 'C', { SIBLINGKEY: 'c' }),
    ];
    const target = [
      row(10, 'A', { SIBLINGKEY: 'a' }),
      row(12, 'C', { SIBLINGKEY: 'c' }),
      row(13, 'X', { SIBLINGKEY: 'x' }),
      row(11, 'B', { SIBLINGKEY: 'b' }),
    ];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result.map((entry) => entry.sourceRow?.title || entry.targetRow?.title)).toEqual(['A', 'C', 'X', 'B']);
  });

  test('keeps an appended target-only row after the last matched row', () => {
    const source = [row(1, 'A', { SIBLINGKEY: 'a' }), row(2, 'B', { SIBLINGKEY: 'b' })];
    const target = [
      row(10, 'A', { SIBLINGKEY: 'a' }),
      row(11, 'B', { SIBLINGKEY: 'b' }),
      row(12, 'Y', { SIBLINGKEY: 'y' }),
    ];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result.map((entry) => entry.sourceRow?.title || entry.targetRow?.title)).toEqual(['A', 'B', 'Y']);
  });

  test('keeps a source-only row in its source-relative position between matched rows', () => {
    const source = [
      row(1, 'A', { SIBLINGKEY: 'a' }),
      row(2, 'Removed', { SIBLINGKEY: 'removed' }),
      row(3, 'B', { SIBLINGKEY: 'b' }),
    ];
    const target = [
      row(10, 'A', { SIBLINGKEY: 'a' }),
      row(11, 'B', { SIBLINGKEY: 'b' }),
    ];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: target,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result.map((entry) => entry.sourceRow?.title || entry.targetRow?.title)).toEqual(['A', 'Removed', 'B']);
    expect(result[1].rowStatus).toBe('source-only');
  });

  test('inherits a timed segment start for a following zero-duration row', () => {
    const source = [
      row(1, 'Segment', { SIBLINGKEY: 'segment' }, 30),
      row(2, 'Note', { SIBLINGKEY: 'note' }, 0),
    ];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: source,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '3:00 PM',
      targetStartTime: '3:00 PM',
    });

    expect(result[1].cells.START.sourceValue).toBe('3:00:00 PM');
  });

  test('uses the unadvanced clock for a leading zero-duration row', () => {
    const source = [row(1, 'Note', { SIBLINGKEY: 'note' }, 0), row(2, 'Segment', { SIBLINGKEY: 'segment' }, 30)];

    const result = buildInlineDiffRows({
      sourceRows: source,
      targetRows: source,
      targetChannelId: 2,
      columns: [],
      sourceStartTime: '4:00 PM',
      targetStartTime: '4:00 PM',
    });

    expect(result[0].cells.START.sourceValue).toBe('4:00:00 PM');
  });

  const build = (
    sourceRows: RunsheetItemRow[],
    targetRows: RunsheetItemRow[],
    options: { columns?: { id: number; key: string; name: string }[]; sourceStartTime?: string; targetStartTime?: string } = {},
  ) =>
    buildInlineDiffRows({
      sourceRows,
      targetRows,
      targetChannelId: 2,
      columns: options.columns ?? [],
      sourceStartTime: options.sourceStartTime ?? '3:00 PM',
      targetStartTime: options.targetStartTime ?? '3:00 PM',
    });
  const titles = (rows: ReturnType<typeof buildInlineDiffRows>) =>
    rows.map((entry) => `${entry.rowStatus[0]}:${entry.sourceRow?.title || entry.targetRow?.title}`);
  const keyed = (id: number, title: string) => row(id, title, { SIBLINGKEY: title });

  describe('value normalisation', () => {
    test('ignores whitespace, line-ending and blank-line noise', () => {
      expect(normalizeInlineDiffValue('  a \t  b\r\nc  ')).toBe(normalizeInlineDiffValue('a b\nc'));
      expect(normalizeInlineDiffValue('a\n\n\n\nb')).toBe(normalizeInlineDiffValue('a\n\nb'));
      expect(normalizeInlineDiffValue('a\n\nb')).not.toBe(normalizeInlineDiffValue('a\nb'));
      expect(normalizeInlineDiffValue('')).toBe('\u0000');
    });

    test('keeps the attached cell link part of the value', () => {
      const linked = (url: string) => `Slides<a class="runsheet-cell-link" data-cell-url="${url}" href="${url}"></a>`;
      expect(classifyInlineDiffCell(linked('https://a.example'), linked('https://a.example')).status).toBe('same');
      expect(classifyInlineDiffCell(linked('https://a.example'), linked('https://b.example')).status).toBe('changed');
      expect(classifyInlineDiffCell('Slides', linked('https://a.example')).status).toBe('changed');
    });

    test('treats whitespace-only and empty markup as empty', () => {
      expect(classifyInlineDiffCell('   ', 'New').status).toBe('added');
      expect(classifyInlineDiffCell('Old', '<p></p>').status).toBe('removed');
      expect(classifyInlineDiffCell('', '  ').status).toBe('same');
    });

    test('returns the raw values, not the normalised ones', () => {
      expect(classifyInlineDiffCell('<p>Same</p>', 'Same ')).toEqual({
        status: 'same',
        sourceValue: '<p>Same</p>',
        targetValue: 'Same ',
      });
    });
  });

  describe('timing columns', () => {
    test('derives start, end and duration from the running clock', () => {
      const rows = [row(1, 'A', {}, 30), row(2, 'B', {}, 0), row(3, 'C', {}, 0), row(4, 'D', {}, 15)];
      const result = build(rows, rows, { sourceStartTime: '9:00 AM', targetStartTime: '9:00 AM' });

      expect(result.map((r) => r.cells.START.sourceValue)).toEqual([
        '9:00:00 AM',
        '9:00:00 AM',
        '9:00:00 AM',
        '9:30:00 AM',
      ]);
      expect(result.map((r) => r.cells.DURATION.sourceValue)).toEqual([expect.any(String), '', '', expect.any(String)]);
      expect(result[0].cells.DURATION.sourceValue).not.toBe('');
      expect(result.every((r) => r.cells.START.status === 'same')).toBe(true);
    });

    test('keeps the clock still across several leading zero-duration rows', () => {
      const rows = [row(1, 'A', {}, 0), row(2, 'B', {}, 0), row(3, 'C', {}, 10)];
      const result = build(rows, rows, { sourceStartTime: '4:00 PM', targetStartTime: '4:00 PM' });
      expect(result.map((r) => r.cells.START.sourceValue)).toEqual(['4:00:00 PM', '4:00:00 PM', '4:00:00 PM']);
    });

    test('defaults to 8 AM when no start time is given', () => {
      const rows = [row(1, 'A', {}, 10)];
      expect(build(rows, rows, { sourceStartTime: '', targetStartTime: '' })[0].cells.START.sourceValue).toBe(
        '8:00:00 AM',
      );
    });

    test('flags a duration change and the shifted start of the next row', () => {
      const source = [keyed(1, 'A'), keyed(2, 'B')];
      const target = [{ ...keyed(10, 'A'), duration: 10 }, keyed(11, 'B')];
      const result = build(source, target);
      expect(result[0].cells.DURATION.status).toBe('changed');
      expect(result[0].cells.START.status).toBe('same');
      expect(result[1].cells.START.status).toBe('changed');
    });
  });

  test('reads the title of a row with no attribute values', () => {
    const bare = { id: 1, title: 'Plain', order: 1, duration: 5 } as RunsheetItemRow;
    const result = build([bare], [], {});
    expect(result[0].cells.title).toMatchObject({ status: 'removed', sourceValue: 'Plain' });
  });

  test('hides roster helper rows', () => {
    const result = build([keyed(1, 'A'), row(2, 'Roster: Worship')], [keyed(10, 'A'), row(11, 'Roster: Worship')]);
    expect(titles(result)).toEqual(['m:A']);
  });

  test('reads custom columns and keys rows by their side and id', () => {
    const result = build([row(1, 'A', { NOTES: 'x' })], [row(10, 'B', { NOTES: 'x' })], {
      columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
    });
    expect(result.map((r) => [r.key, r.rowStatus, r.sourceIndex, r.targetIndex])).toEqual([
      ['source:number:1', 'source-only', 0, null],
      ['target:number:10', 'target-only', null, 0],
    ]);
    expect(result[0].cells.NOTES).toEqual({ status: 'removed', sourceValue: 'x', targetValue: '' });
    expect(result[1].cells.title.status).toBe('added');
  });

  describe('row ordering', () => {
    test('shows matched rows in target order with both indexes', () => {
      const result = build([keyed(1, 'A'), keyed(2, 'B'), keyed(3, 'C')], [keyed(12, 'C'), keyed(10, 'A'), keyed(11, 'B')]);
      expect(titles(result)).toEqual(['m:C', 'm:A', 'm:B']);
      expect(result.map((r) => [r.sourceIndex, r.targetIndex])).toEqual([
        [2, 0],
        [0, 1],
        [1, 2],
      ]);
    });

    test('keeps consecutive removed rows in source order after their neighbour', () => {
      const result = build(
        [keyed(1, 'A'), keyed(2, 'R1'), keyed(3, 'R2'), keyed(4, 'R3'), keyed(5, 'B')],
        [keyed(10, 'A'), keyed(11, 'B')],
      );
      expect(titles(result)).toEqual(['m:A', 's:R1', 's:R2', 's:R3', 'm:B']);
    });

    test('places leading removed rows before the first matched row', () => {
      const result = build([keyed(1, 'R1'), keyed(2, 'R2'), keyed(3, 'A')], [keyed(10, 'A'), keyed(11, 'N')]);
      expect(titles(result)).toEqual(['s:R1', 's:R2', 'm:A', 't:N']);
    });

    test('keeps a removed row next to its source neighbour when rows moved', () => {
      const result = build([keyed(1, 'A'), keyed(2, 'R'), keyed(3, 'B')], [keyed(11, 'B'), keyed(10, 'A')]);
      expect(titles(result)).toEqual(['m:B', 'm:A', 's:R']);
    });

    test('appends rows in order when nothing matched', () => {
      const result = build([keyed(1, 'R1'), keyed(2, 'R2')], [keyed(10, 'N1'), keyed(11, 'N2')]);
      expect(titles(result)).toEqual(['s:R1', 's:R2', 't:N1', 't:N2']);
    });

    test('keeps consecutive added rows in target order after their neighbour', () => {
      const result = build(
        [keyed(1, 'A'), keyed(2, 'B')],
        [keyed(10, 'A'), keyed(11, 'N1'), keyed(12, 'N2'), keyed(13, 'N3'), keyed(14, 'B')],
      );
      expect(titles(result)).toEqual(['m:A', 't:N1', 't:N2', 't:N3', 'm:B']);
    });

    test('places leading added rows before the first matched row', () => {
      const result = build([keyed(1, 'A')], [keyed(10, 'N1'), keyed(11, 'N2'), keyed(12, 'A')]);
      expect(titles(result)).toEqual(['t:N1', 't:N2', 'm:A']);
    });

    test('puts an added row after removed rows that share its neighbour', () => {
      const result = build([keyed(1, 'A'), keyed(2, 'R'), keyed(3, 'B')], [keyed(10, 'A'), keyed(11, 'N'), keyed(12, 'B')]);
      expect(titles(result)).toEqual(['m:A', 't:N', 's:R', 'm:B']);
    });
  });
});
