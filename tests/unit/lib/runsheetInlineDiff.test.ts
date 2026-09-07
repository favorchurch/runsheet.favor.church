import { buildInlineDiffRows, classifyInlineDiffCell } from '@/lib/runsheetInlineDiff';
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
});
