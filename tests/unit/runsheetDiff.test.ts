import type { RunsheetItemRow } from '@/types/Runsheet';

interface RowFingerprint {
  title: string;
  order: number;
  startDateTime?: string;
  duration: number;
  songItemId?: number | null;
  attributeValues: Record<string, string>;
}

function createRowFingerprint(item: RunsheetItemRow): RowFingerprint {
  const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
  const cleanAttrValues: Record<string, string> = {};
  if (item.attributeValues) {
    Object.entries(item.attributeValues).forEach(([k, v]) => {
      cleanAttrValues[k] = v ?? '';
    });
  }

  return {
    title: richTitle,
    order: item.order,
    startDateTime: item.startDateTime,
    duration: item.duration || 0,
    songItemId: item.songItemId ?? null,
    attributeValues: cleanAttrValues,
  };
}

function computeDiff(
  items: RunsheetItemRow[],
  baselineMap: Map<number | string, RowFingerprint>
): RunsheetItemRow[] {
  const itemsToSave: RunsheetItemRow[] = [];

  items.forEach((item) => {
    const isNewItem = typeof item.id === 'string' || item.isNew;
    if (isNewItem) {
      itemsToSave.push({ ...item });
      return;
    }

    const baseline = baselineMap.get(item.id);
    if (!baseline) {
      itemsToSave.push({ ...item });
      return;
    }

    const changedKeys: string[] = [];

    const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
    if (richTitle !== baseline.title) {
      changedKeys.push('title');
      changedKeys.push('ACTIVITYTITLE');
    }

    if (item.order !== baseline.order) {
      changedKeys.push('order');
    }

    if (item.startDateTime !== baseline.startDateTime) {
      changedKeys.push('startDateTime');
    }

    if ((item.duration || 0) !== baseline.duration) {
      changedKeys.push('DURATION');
      changedKeys.push('duration');
    }

    if ((item.songItemId ?? null) !== baseline.songItemId) {
      changedKeys.push('SONGITEMID');
      changedKeys.push('songItemId');
    }

    const currentAttrs = item.attributeValues || {};
    const baselineAttrs = baseline.attributeValues || {};

    const allKeys = new Set([...Object.keys(currentAttrs), ...Object.keys(baselineAttrs)]);
    allKeys.forEach((key) => {
      if (key === 'ACTIVITYTITLE') return;
      const curVal = currentAttrs[key] ?? '';
      const baseVal = baselineAttrs[key] ?? '';
      if (curVal !== baseVal) {
        if (!changedKeys.includes(key)) {
          changedKeys.push(key);
        }
      }
    });

    if (changedKeys.length > 0) {
      itemsToSave.push({ ...item, changedKeys });
    }
  });

  return itemsToSave;
}

describe('runsheetDiff logic', () => {
  const baseItem1: RunsheetItemRow = {
    id: 101,
    title: 'Pre-Service Huddle',
    order: 1,
    startDateTime: '2026-08-12T08:00:00.000Z',
    duration: 10,
    attributeValues: { ACTIVITYTITLE: 'Pre-Service Huddle', SPEAKER: 'Pastor A' },
  };

  const baseItem2: RunsheetItemRow = {
    id: 102,
    title: 'Worship Praise',
    order: 2,
    startDateTime: '2026-08-12T08:10:00.000Z',
    duration: 15,
    attributeValues: { ACTIVITYTITLE: 'Worship Praise', LEAD: 'Worship Team' },
  };

  let baselineMap: Map<number | string, RowFingerprint>;

  beforeEach(() => {
    baselineMap = new Map();
    baselineMap.set(101, createRowFingerprint(baseItem1));
    baselineMap.set(102, createRowFingerprint(baseItem2));
  });

  test('A no-op save produces an empty payload', () => {
    const diff = computeDiff([baseItem1, baseItem2], baselineMap);
    expect(diff).toEqual([]);
  });

  test('A single cell edit produces one row with exactly matching changed keys', () => {
    const editedItem1 = {
      ...baseItem1,
      attributeValues: { ...baseItem1.attributeValues, SPEAKER: 'Pastor B' },
    };
    const diff = computeDiff([editedItem1, baseItem2], baselineMap);
    expect(diff).toHaveLength(1);
    expect(diff[0].id).toBe(101);
    expect(diff[0].changedKeys).toEqual(['SPEAKER']);
  });

  test('A duration edit produces one changed row + timing-only row for lower row', () => {
    const editedItem1 = { ...baseItem1, duration: 12 };
    const editedItem2 = { ...baseItem2, startDateTime: '2026-08-12T08:12:00.000Z' };

    const diff = computeDiff([editedItem1, editedItem2], baselineMap);
    expect(diff).toHaveLength(2);
    expect(diff[0].id).toBe(101);
    expect(diff[0].changedKeys).toContain('DURATION');
    expect(diff[1].id).toBe(102);
    expect(diff[1].changedKeys).toEqual(['startDateTime']);
  });

  test('A reorder produces timing-only rows for affected tail', () => {
    const reordered1 = { ...baseItem2, order: 1, startDateTime: '2026-08-12T08:00:00.000Z' };
    const reordered2 = { ...baseItem1, order: 2, startDateTime: '2026-08-12T08:15:00.000Z' };

    const diff = computeDiff([reordered1, reordered2], baselineMap);
    expect(diff).toHaveLength(2);
    expect(diff[0].changedKeys).toEqual(['order', 'startDateTime']);
    expect(diff[1].changedKeys).toEqual(['order', 'startDateTime']);
  });
});
