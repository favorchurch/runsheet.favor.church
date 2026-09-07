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
});
