import { describe, expect, it } from '@jest/globals';
import React from 'react';
import {
  buildRunsheetExportModel,
  RunsheetPdfDocument,
  renderRunsheetPdf,
} from '@/lib/runsheetExport';
import type { RunsheetDetails, RunsheetItemRow } from '@/types/Runsheet';

function collectText(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (React.isValidElement(node)) return collectText((node.props as { children?: unknown }).children);
  return [];
}

describe('runsheetExport multi-page and safety rendering', () => {
  it('renders a fixture of at least 60 rows with cells over 2000 chars across multiple pages without truncation', async () => {
    const totalRows = 65;
    const longCellContent =
      '<p>Comprehensive instructions for this service segment: ' +
      'Detailed stage cues, lighting instructions, live stream notes, camera angles, and backup contingencies. '.repeat(
        25,
      ) +
      '</p>';

    expect(longCellContent.length).toBeGreaterThan(2000);

    const items: RunsheetItemRow[] = Array.from({ length: totalRows }, (_, i) => ({
      id: i + 1,
      order: (i + 1) * 10,
      title: `Runsheet Segment ${i + 1}`,
      duration: i % 5 === 0 ? 5 : 0, // Mix of timed rows and zero-duration sub-items
      attributeValues: {
        ACTIVITYTITLE: `Runsheet Segment ${i + 1}`,
        PLATFORM: i % 2 === 0 ? 'Pastor Leader' : '',
        DESCRIPTION: i === 10 ? longCellContent : `Normal description for segment ${i + 1}`,
      },
    }));

    const details: RunsheetDetails = {
      channelId: 999,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      subtitle: 'Sunday Main Service - Multi-page Export',
      startTime: '09:00:00 AM',
      columns: [
        { id: 1, key: 'PLATFORM', name: 'Platform', fieldTypeId: 18 },
        { id: 2, key: 'DESCRIPTION', name: 'Detail' },
      ],
      items,
      contentChannelTypeId: 13,
    };

    // 1. Build model and assert model integrity
    const model = buildRunsheetExportModel(details);

    // Assert that every row title is present in the model
    expect(model.rows).toHaveLength(totalRows);
    for (let i = 0; i < totalRows; i++) {
      expect(model.rows[i].title).toBe(`Runsheet Segment ${i + 1}`);
    }

    // Assert that no cell text is truncated in the model
    const longRow = model.rows[10];
    expect(longRow.values['DESCRIPTION'].length).toBeGreaterThan(2000);
    expect(longRow.values['DESCRIPTION']).toContain('Detailed stage cues');

    // 2. Render real PDF and assert multiple pages
    const pdfBuffer = await renderRunsheetPdf(model);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.slice(0, 4).toString('utf-8')).toBe('%PDF');

    // Count pages via PDF object dictionary /Type /Page
    const pdfContent = pdfBuffer.toString('binary');
    const pageMatches = pdfContent.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 0;

    expect(pageCount).toBeGreaterThan(1);
  });

  it('renders a fixture containing emoji, non-Latin text, and a 300-char unbroken URL without throwing', async () => {
    const longUrl = 'https://favor.church/resources/media/downloads/' + 'long_path_segment_'.repeat(16) + 'final_token';
    expect(longUrl.length).toBeGreaterThan(300);

    const items: RunsheetItemRow[] = [
      {
        id: 1,
        order: 1,
        title: 'Welcome 🎉 & Greeting 🙏',
        duration: 5,
        attributeValues: {
          ACTIVITYTITLE: 'Welcome 🎉 & Greeting 🙏',
          PLATFORM: 'Pastor John',
          DESCRIPTION: '<p>Greek: Ελληνικά • Cyrillic: Привет мир</p>',
        },
      },
      {
        id: 2,
        order: 2,
        title: 'Video Presentation',
        duration: 5,
        attributeValues: {
          ACTIVITYTITLE: 'Video Presentation',
          DESCRIPTION: `<p>Download reference asset at <a href="${longUrl}" data-cell-url="${longUrl}" class="runsheet-cell-link">${longUrl}</a></p>`,
        },
      },
    ];

    const details: RunsheetDetails = {
      channelId: 888,
      name: 'BNE Service 🌟 // Nov 15 // 10AM',
      items,
      columns: [
        { id: 1, key: 'PLATFORM', name: 'Platform', fieldTypeId: 18 },
        { id: 2, key: 'DESCRIPTION', name: 'Detail' },
      ],
      contentChannelTypeId: 13,
    };

    const model = buildRunsheetExportModel(details);
    expect(model.scope).toBe('Service: BNE Service ? 10AM');
    const pdfBuffer = await renderRunsheetPdf(model);

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.slice(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('renders the scope line in the fixed header and a Korean fallback glyph run', async () => {
    const model = buildRunsheetExportModel({
      channelId: 777,
      name: 'MNL Crowne // October 11, 2026 // 10AM',
      items: [
        {
          id: 1,
          order: 1,
          title: '찬양',
          duration: 5,
          attributeValues: { ACTIVITYTITLE: '찬양 Worship' },
        },
      ],
      columns: [],
      contentChannelTypeId: 13,
    });
    expect(model.scope).toBe('Service: MNL Crowne 10AM');
    expect(model.rows[0].activityTitle).toBe('찬양 Worship');

    const doc = RunsheetPdfDocument({ model });
    expect(collectText(doc)).toContain('Service: MNL Crowne 10AM');

    const pdfBuffer = await renderRunsheetPdf(model);
    expect(pdfBuffer.toString('binary')).toContain('NotoSansKR-Regular');
  });
});
