import { matchRows } from '@/lib/runsheetMatch';
import type { RunsheetItemRow } from '@/types/Runsheet';

function row(id: number, title: string, siblingKey?: string): RunsheetItemRow {
  return {
    id,
    title,
    order: id,
    duration: 5,
    attributeValues: siblingKey ? { SIBLINGKEY: siblingKey } : {},
  };
}

describe('matchRows', () => {
  it('matches rows sharing a SIBLINGKEY regardless of title', () => {
    const source = [row(1, 'Welcome', 'abc-123')];
    const target = [row(10, 'Welcome Note', 'abc-123')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('siblingKey');
    expect(matches[0].targetRow?.id).toBe(10);
    expect(backfill).toEqual([]);
  });

  it('matches by unique title when neither row has a SIBLINGKEY, and emits a backfill entry for both sides', () => {
    const source = [row(1, 'Welcome')];
    const target = [row(10, 'Welcome')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
    expect(backfill).toHaveLength(2);
    expect(backfill.map((b) => b.itemId).sort()).toEqual([1, 10]);
    expect(backfill[0].key).toBe(backfill[1].key);
  });

  it('does not match a title that appears twice in the target', () => {
    const source = [row(1, 'Song')];
    const target = [row(10, 'Song'), row(11, 'Song')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches).toHaveLength(1);
    expect(matches[0].via).toBe('none');
    expect(matches[0].targetRow).toBeNull();
    expect(backfill).toEqual([]);
  });

  it('reports none for a source row with no counterpart', () => {
    const source = [row(1, 'Altar Call')];
    const target = [row(10, 'Welcome')];
    const { matches } = matchRows(source, 99, target);

    expect(matches[0].via).toBe('none');
    expect(matches[0].targetRow).toBeNull();
  });

  it('prefers SIBLINGKEY over a conflicting title match', () => {
    const source = [row(1, 'Welcome', 'abc-123')];
    const target = [row(10, 'Something Else', 'abc-123'), row(11, 'Welcome')];
    const { matches } = matchRows(source, 99, target);

    expect(matches[0].via).toBe('siblingKey');
    expect(matches[0].targetRow?.id).toBe(10);
  });
});
