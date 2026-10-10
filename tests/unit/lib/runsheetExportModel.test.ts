import { describe, expect, it } from '@jest/globals';
import {
  buildRunsheetExportModel,
  computeDynamicColumns,
  hasUnsupportedGlyphs,
  runsheetRichTextToPlainText,
  scrubPersonValue,
} from '@/lib/runsheetExport';
import type { RunsheetDetails } from '@/types/Runsheet';

describe('buildRunsheetExportModel pure function', () => {
  it('excludes rows whose title starts with "Roster:" and rows marked isDeleted', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      items: [
        { id: 1, order: 1, title: 'Welcome', duration: 5, attributeValues: {} },
        { id: 2, order: 2, title: 'Roster: Band Vocals', duration: 0, attributeValues: {} },
        { id: 3, order: 3, title: 'Roster: Ushers', duration: 10, attributeValues: {} },
        { id: 4, order: 4, title: 'Deleted Segment', duration: 5, isDeleted: true, attributeValues: {} },
        { id: 5, order: 5, title: 'Closing', duration: 5, attributeValues: {} },
      ],
      columns: [],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    const titles = model.rows.map((r) => r.title);
    expect(titles).toEqual(['Welcome', 'Closing']);
  });

  it('sorts rows by order property', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      items: [
        { id: 3, order: 30, title: 'Segment 3', duration: 5, attributeValues: {} },
        { id: 1, order: 10, title: 'Segment 1', duration: 5, attributeValues: {} },
        { id: 2, order: 20, title: 'Segment 2', duration: 5, attributeValues: {} },
      ],
      columns: [],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(model.rows.map((r) => r.title)).toEqual(['Segment 1', 'Segment 2', 'Segment 3']);
  });

  it('handles zero-duration rows as sub-items inheriting parent segment start time', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      startTime: '09:00:00 AM',
      items: [
        { id: 1, order: 1, title: 'Worship Set', duration: 20, attributeValues: {} },
        { id: 2, order: 2, title: 'Song 1 - Praise', duration: 0, attributeValues: {} },
        { id: 3, order: 3, title: 'Song 2 - Adoration', duration: 0, attributeValues: {} },
        { id: 4, order: 4, title: 'Preaching', duration: 35, attributeValues: {} },
      ],
      columns: [],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(model.rows).toHaveLength(4);

    // Parent Worship Set (9:00 AM, 20 mins)
    expect(model.rows[0].start).toBe('9:00:00 AM');
    expect(model.rows[0].duration).toBe('00:20:00');

    // Sub-items inherit Worship Set's start time and have empty duration
    expect(model.rows[1].start).toBe('9:00:00 AM');
    expect(model.rows[1].duration).toBe('');
    expect(model.rows[2].start).toBe('9:00:00 AM');
    expect(model.rows[2].duration).toBe('');

    // Preaching begins at 9:20 AM
    expect(model.rows[3].start).toBe('9:20:00 AM');
    expect(model.rows[3].duration).toBe('00:35:00');
  });

  it('seeds the clock from details.startTime falling back to parseStartTimeFromRunsheetName', () => {
    // 1. Explicit startTime provided
    const explicit = buildRunsheetExportModel({
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      startTime: '08:30:00 AM',
      items: [{ id: 1, order: 1, title: 'Opening', duration: 10, attributeValues: {} }],
      columns: [],
      contentChannelTypeId: 13,
    });
    expect(explicit.rows[0].start).toBe('8:30:00 AM');

    // 2. Fallback to runsheet name: "10AM" -> service starts at 10:00 AM, runsheet starts 1 hour before: 9:00:00 AM
    const fallback = buildRunsheetExportModel({
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      items: [{ id: 1, order: 1, title: 'Opening', duration: 10, attributeValues: {} }],
      columns: [],
      contentChannelTypeId: 13,
    });
    expect(fallback.rows[0].start).toBe('9:00:00 AM');
  });

  it('excludes RESERVED_RUNSHEET_COLUMN_KEYS from dynamic columns', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'Test Runsheet',
      columns: [
        { id: 1, key: 'ACTIVITYTITLE', name: 'Activity Title' },
        { id: 2, key: 'TITLE', name: 'Title' },
        { id: 3, key: 'DESCRIPTION', name: 'Detail' },
      ],
      items: [],
      contentChannelTypeId: 13,
    };

    const dynamicCols = computeDynamicColumns(details.columns);
    expect(dynamicCols.map((c) => c.key)).toEqual(['DESCRIPTION']);
  });

  it('uses FALLBACK_RUNSHEET_COLUMNS when columns array is empty', () => {
    const dynamicCols = computeDynamicColumns([]);
    expect(dynamicCols.length).toBeGreaterThan(0);
    // FALLBACK_RUNSHEET_COLUMNS has PLATFORM, DESCRIPTION, etc.
    expect(dynamicCols.some((c) => c.key === 'PLATFORM')).toBe(true);
    expect(dynamicCols.some((c) => c.key === 'DESCRIPTION')).toBe(true);
  });

  it('orders dynamic columns by stored columnMetadata.order with unlisted keys going last', () => {
    const columns = [
      { id: 1, key: 'AUDIO', name: 'Audio' },
      { id: 2, key: 'LIGHTING', name: 'Lighting' },
      { id: 3, key: 'DESCRIPTION', name: 'Detail' },
      { id: 4, key: 'PLATFORM', name: 'Platform' },
    ];
    const columnMetadata = {
      order: ['LIGHTING', 'AUDIO'],
    };

    const ordered = computeDynamicColumns(columns, columnMetadata);
    expect(ordered.map((c) => c.key)).toEqual(['LIGHTING', 'AUDIO', 'DESCRIPTION', 'PLATFORM']);
  });

  it('applies editor default rule placing platform/person column ahead of description when no stored order', () => {
    const columns = [
      { id: 1, key: 'DESCRIPTION', name: 'Detail' },
      { id: 2, key: 'AUDIO', name: 'Audio' },
      { id: 3, key: 'PLATFORM', name: 'Platform' },
    ];

    const ordered = computeDynamicColumns(columns);
    // Platform must move ahead of Description
    const platformIdx = ordered.findIndex((c) => c.key === 'PLATFORM');
    const descIdx = ordered.findIndex((c) => c.key === 'DESCRIPTION');
    expect(platformIdx).toBeLessThan(descIdx);
  });

  it('parses title, date, time, and campus from channel name', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      subtitle: 'Sunday Service',
      items: [],
      columns: [],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(model.title).toBe('MNL Crowne');
    expect(model.time).toBe('10AM');
    expect(model.campus).toBe('MNL');
    expect(model.subtitle).toBe('Sunday Service');
    expect(model.date).toContain('2026');
    expect(model.scope).toBe('Service: MNL Crowne 10AM');
  });

  it('trims the scope line when the name has no time', () => {
    const model = buildRunsheetExportModel({
      channelId: 102,
      name: 'Easter Special',
      items: [],
      columns: [],
      contentChannelTypeId: 13,
    });
    expect(model.scope).toBe('Service: Easter Special');
  });

  it('sanitizes the scope line and replaces whole emoji sequences with a single "?"', () => {
    const model = buildRunsheetExportModel({
      channelId: 103,
      name: 'MNL 👨‍👩‍👧 Service // October 11, 2026 // 10AM',
      items: [
        {
          id: 1,
          order: 1,
          title: 'Prayer',
          duration: 5,
          attributeValues: { DESCRIPTION: '<p>unity ❤️ and peace 🕊️</p>' },
        },
      ],
      columns: [{ id: 1, key: 'DESCRIPTION', name: 'Detail' }],
      contentChannelTypeId: 13,
    });
    expect(model.scope).toBe('Service: MNL ? Service 10AM');
    expect(model.rows[0].values['DESCRIPTION']).toBe('unity ? and peace ?');
  });

  it('sanitizes all model strings deterministically with no unsupported glyphs', () => {
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Service 🔥 // October 11, 2026 // 10AM',
      subtitle: 'Praise & Worship 🎉',
      items: [
        {
          id: 1,
          order: 1,
          title: 'Opening Prayer 🙏',
          duration: 5,
          attributeValues: {
            DESCRIPTION: '<p>Special prayer for unity ❤️ and peace 🕊️</p>',
          },
        },
      ],
      columns: [{ id: 1, key: 'DESCRIPTION', name: 'Detail' }],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(hasUnsupportedGlyphs(model.name)).toBe(false);
    expect(hasUnsupportedGlyphs(model.subtitle)).toBe(false);
    expect(hasUnsupportedGlyphs(model.rows[0].title)).toBe(false);
    expect(hasUnsupportedGlyphs(model.rows[0].activityTitle)).toBe(false);
    expect(hasUnsupportedGlyphs(model.rows[0].values['DESCRIPTION'])).toBe(false);
  });
});

describe('richTextPlain conversion', () => {
  it('extracts cell URL first, formats lists, and appends cell URL as visible text', () => {
    const htmlWithLinkAndList =
      '<p>Key items to cover:</p>' +
      '<ul><li>Item Alpha</li><li>Item Beta</li></ul>' +
      '<a href="https://favor.church/guide" data-cell-url="https://favor.church/guide" class="runsheet-cell-link">link</a>';

    const plain = runsheetRichTextToPlainText(htmlWithLinkAndList);

    expect(plain).toContain('Key items to cover:');
    expect(plain).toContain('• Item Alpha');
    expect(plain).toContain('• Item Beta');
    expect(plain).toContain('https://favor.church/guide');
    expect(plain.endsWith('https://favor.church/guide')).toBe(true);
  });

  it('formats ordered lists with numbers', () => {
    const html = '<ol><li>Step 1</li><li>Step 2</li><li>Step 3</li></ol>';
    const plain = runsheetRichTextToPlainText(html);

    expect(plain).toContain('1. Step 1');
    expect(plain).toContain('2. Step 2');
    expect(plain).toContain('3. Step 3');
  });
});

describe('personScrubber', () => {
  it('renders display names for resolved person values', () => {
    expect(scrubPersonValue('Pastor John Doe')).toBe('Pastor John Doe');
    expect(scrubPersonValue('Jane Smith')).toBe('Jane Smith');
  });

  it('renders "—" for unresolved PersonAlias GUIDs', () => {
    expect(scrubPersonValue('e3b0c442-98fc-1c14-9afb-f4c8996fb924')).toBe('—');
    expect(scrubPersonValue('E3B0C442-98FC-1C14-9AFB-F4C8996FB924')).toBe('—');
    expect(scrubPersonValue('e3b0c44298fc1c149afbf4c8996fb924')).toBe('—');
  });

  it('renders "—" for numeric Rock IDs', () => {
    expect(scrubPersonValue('12345')).toBe('—');
    expect(scrubPersonValue('7001')).toBe('—');
  });

  it('renders "—" for values containing an email address', () => {
    expect(scrubPersonValue('john.doe@example.com')).toBe('—');
    expect(scrubPersonValue('Pastor John <john@favor.church>')).toBe('—');
  });

  it('renders "—" for phone-shaped values', () => {
    expect(scrubPersonValue('+1 (555) 123-4567')).toBe('—');
    expect(scrubPersonValue('+63 917 123 4567')).toBe('—');
    expect(scrubPersonValue('0917-123-4567')).toBe('—');
    expect(scrubPersonValue('123.456.7890')).toBe('—');
  });

  it('renders empty string for null or empty values', () => {
    expect(scrubPersonValue('')).toBe('');
    expect(scrubPersonValue(null)).toBe('');
  });

  it('does NOT scrub authored free text in non-person columns', () => {
    // Only person-sourced columns are scrubbed; authored free text renders verbatim as in UI
    const details: RunsheetDetails = {
      channelId: 101,
      name: 'MNL Service // Oct 11 // 10AM',
      columns: [
        { id: 1, key: 'PLATFORM', name: 'Platform', fieldTypeId: 18 },
        { id: 2, key: 'DESCRIPTION', name: 'Detail' },
      ],
      items: [
        {
          id: 1,
          order: 1,
          title: 'Segment 1',
          duration: 5,
          attributeValues: {
            PLATFORM: '7001', // Person column with numeric id -> scrubbed to "—"
            DESCRIPTION: 'Call 12345 or email help@favor.church for details.', // Authored free text -> NOT scrubbed
          },
        },
      ],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(model.rows[0].values['PLATFORM']).toBe('—');
    expect(model.rows[0].values['DESCRIPTION']).toContain('12345');
    expect(model.rows[0].values['DESCRIPTION']).toContain('help@favor.church');
  });
});
