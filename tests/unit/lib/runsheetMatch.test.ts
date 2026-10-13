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

  it('marks the source side of a backfill with channel -1 and the target side with the target channel', () => {
    const { backfill } = matchRows([row(1, 'Welcome')], 99, [row(10, 'Welcome')]);

    expect(backfill).toEqual([
      { channelId: -1, itemId: 1, key: expect.any(String) },
      { channelId: 99, itemId: 10, key: backfill[0].key },
    ]);
    expect(backfill[0].key).not.toBe('');
  });

  it('matches titles after trimming, preferring ACTIVITYTITLE over the row title', () => {
    const source = [{ ...row(1, 'ignored'), attributeValues: { ACTIVITYTITLE: '  Welcome ' } }];
    const target = [row(10, 'Welcome '), row(11, 'ignored')];
    const { matches } = matchRows(source, 99, target);

    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
  });

  it('does not title-match a title that appears twice in the source', () => {
    const source = [row(1, 'Song'), row(2, 'Song')];
    const target = [row(10, 'Song')];
    const { matches, backfill } = matchRows(source, 99, target);

    expect(matches.map((m) => m.via)).toEqual(['none', 'none']);
    expect(backfill).toEqual([]);
  });

  it('pairs untitled rows as title "" when each side has exactly one', () => {
    const untitled = (id: number): RunsheetItemRow => ({ id, title: '', order: id, duration: 5, attributeValues: {} });
    const { matches } = matchRows([untitled(1)], 99, [untitled(10), row(11, 'Welcome')]);

    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
  });

  it('matches rows that carry no attribute values', () => {
    const bare = (id: number, title: string) => ({ id, title, order: id, duration: 5 }) as RunsheetItemRow;
    const { matches } = matchRows([bare(1, 'Welcome')], 99, [bare(10, 'Welcome')]);

    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
  });

  it('falls back to title when the source SIBLINGKEY has no counterpart', () => {
    const { matches } = matchRows([row(1, 'Welcome', 'orphan')], 99, [row(10, 'Welcome', 'other')]);

    expect(matches[0].via).toBe('title');
    expect(matches[0].targetRow?.id).toBe(10);
  });

  it('matches an unsaved row (string id) but cannot backfill it', () => {
    const source = [{ ...row(1, 'Welcome'), id: 'new-1' }];
    const { matches, backfill } = matchRows(source, 99, [row(10, 'Welcome')]);

    expect(matches[0].via).toBe('title');
    expect(backfill).toEqual([]);
  });
});
