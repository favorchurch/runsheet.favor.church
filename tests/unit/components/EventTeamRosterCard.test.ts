import { computePlatformRoles, extractPeopleFromRow } from '@/components/runsheet/EventTeamRosterCard';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('EventTeamRosterCard helpers', () => {
  const columns: DynamicAttributeColumn[] = [
    { id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
    { id: 2, key: 'DESCRIPTION', name: 'Detail' },
  ];

  it('extracts people from row correctly', () => {
    const row: RunsheetItemRow = {
      id: 101,
      title: 'All-In Huddle',
      order: 1,
      duration: 15,
      attributeValues: { PLATFORM: 'Jerwyn (Guest), John Doe' },
    };
    const names = extractPeopleFromRow(row, columns);
    expect(names).toEqual(['Jerwyn', 'John Doe']);
  });

  it('computes platform roles dynamically from schedule items', () => {
    const items: RunsheetItemRow[] = [
      { id: 0, title: 'Runsheet Huddle', order: 0, duration: 10, attributeValues: { PLATFORM: 'Alex' } },
      { id: 1, title: 'All-In Huddle', order: 1, duration: 15, attributeValues: { PLATFORM: 'Jerwyn' } },
      { id: 2, title: 'MC1', order: 2, duration: 3, attributeValues: { PLATFORM: 'Sarah' } },
      { id: 3, title: 'MC2', order: 3, duration: 5, attributeValues: { PLATFORM: 'Mike' } },
      { id: 4, title: 'Sermon', order: 4, duration: 45, attributeValues: { PLATFORM: 'Pastor Paul' } },
      { id: 5, title: 'Wrap-up & Announcements', order: 5, duration: 2, detail: 'Next steps &amp; closing prayer', attributeValues: {} },
    ];

    const platform = computePlatformRoles(items, columns);
    expect(platform.runsheetHuddle).toBe('Alex');
    expect(platform.huddleHype).toBe('Jerwyn');
    expect(platform.mc1).toBe('Sarah');
    expect(platform.mc2).toBe('Mike');
    expect(platform.preacher).toBe('Pastor Paul');
    expect(platform.wrapText).toBe('Next steps &amp; closing prayer');
  });
});
