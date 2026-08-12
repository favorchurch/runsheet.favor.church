import { computePlatformRoles, extractPeopleFromRow, ensureRosterItems, VITAL_ROLES } from '@/components/runsheet/EventTeamRosterCard';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('EventTeamRosterCard helpers', () => {
  const columns: DynamicAttributeColumn[] = [
    { id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
    { id: 2, key: 'DESCRIPTION', name: 'Detail' },
  ];

  it('contains Assistant Stage Managers and Assistant Service Producers in VITAL_ROLES', () => {
    expect(VITAL_ROLES).toContain('Assistant Stage Managers');
    expect(VITAL_ROLES).toContain('Assistant Service Producers');
    expect(VITAL_ROLES.length).toBe(10);
  });

  it('ensures roster items exist for all vital roles', () => {
    const items = ensureRosterItems([]);
    expect(items.length).toBe(10);
    expect(items.map((i) => i.title)).toEqual([
      'Roster: Service Director',
      'Roster: Service Producer',
      'Roster: Assistant Service Producers',
      'Roster: Stage Manager Captain',
      'Roster: Assistant Stage Managers',
      'Roster: Music Director',
      'Roster: Offstage Director',
      'Roster: Worship Leaders',
      'Roster: Host Core Cap',
      'Roster: Security Lead',
    ]);
  });

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
