/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof (global as any).Request === 'undefined') {
  (global as any).Request = class Request {};
}
if (typeof (global as any).Response === 'undefined') {
  (global as any).Response = class Response {};
}

jest.mock('@auth0/nextjs-auth0', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');
jest.mock('@/server-actions/rockDuplicateServiceRunsheet');
jest.mock('@/server-actions/rockDeleteServiceRunsheet');
jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/components/runsheet/runsheetQueries', () => ({
  ...jest.requireActual('@/components/runsheet/runsheetQueries'),
  useRosterAssignments: () => ({ data: undefined }),
}));
jest.mock('@/lib/richText', () => ({
  htmlToPlainText: (s: string) => s,
  legacyValueToHtml: (s: string) => s,
  sanitizeRichText: (s: string) => s,
  extractCellUrl: (s: string) => ({ contentHtml: s, url: null }),
  embedCellUrl: (contentHtml: string, url: string | null) => (url ? `${contentHtml}${url}` : contentHtml),
  isRichTextEmpty: (s: string) => !s,
  normalizeRichTextValue: (s: string) => s || '',
  RICH_TEXT_ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'span', 'br', 'ul', 'ol', 'li', 'a'],
  RICH_TEXT_ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'rel', 'data-cell-url'],
}));

import '@testing-library/jest-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

/**
 * Live progress greys finished segments and highlights the one planned for
 * now, by the campus clock, only on the runsheet's own service day.
 */
describe('RunsheetTableEditor live progress', () => {
  const columns: DynamicAttributeColumn[] = [{ id: 101, key: 'DESCRIPTION', name: 'Detail' }];

  const items: RunsheetItemRow[] = [
    { id: 1, title: 'Fast Songs', order: 1, duration: 15, attributeValues: { ACTIVITYTITLE: 'Fast Songs' } },
    { id: 2, title: 'He Shall Be Praised', order: 2, duration: 0, attributeValues: { ACTIVITYTITLE: 'He Shall Be Praised' } },
    { id: 3, title: 'MC1', order: 3, duration: 5, attributeValues: { ACTIVITYTITLE: 'MC1' } },
    { id: 4, title: 'Sermon', order: 4, duration: 45, attributeValues: { ACTIVITYTITLE: 'Sermon' } },
  ];
  // 9:00 Fast Songs (+ sub-item) → 9:15 MC1 → 9:20 Sermon → 10:05

  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderAt(utc: Date, channelName: string) {
    jest.setSystemTime(utc);
    const { container } = render(
      <RunsheetTableEditor
        channelId={1}
        channelName={channelName}
        columns={columns}
        initialItems={items}
        initialStartTime="9:00:00 AM"
        readOnly
      />,
    );
    return Array.from(container.querySelectorAll('tbody tr')).filter((row) =>
      row.textContent?.match(/Fast Songs|He Shall Be Praised|MC1|Sermon/),
    ) as HTMLElement[];
  }

  it('greys finished segments and their sub-items, and marks the current one', () => {
    // 9:17 AM Manila = 01:17 UTC
    const rows = renderAt(new Date(Date.UTC(2026, 10, 22, 1, 17)), 'MNL Crowne // November 22, 2026 // 10AM');
    expect(rows.map((row) => row.dataset.progress)).toEqual(['past', 'past', 'current', 'upcoming']);
    expect(rows[2].textContent).toContain('Now');
  });

  it('uses the campus clock, not the device clock', () => {
    // 01:17 UTC is 11:17 AM in Brisbane: every segment has finished.
    const rows = renderAt(new Date(Date.UTC(2026, 10, 22, 1, 17)), 'BNE // November 22, 2026 // 10AM');
    expect(rows.map((row) => row.dataset.progress)).toEqual(['past', 'past', 'past', 'past']);
  });

  it('leaves runsheets for other days unstyled', () => {
    const rows = renderAt(new Date(Date.UTC(2026, 10, 22, 1, 17)), 'MNL Crowne // November 29, 2026 // 10AM');
    expect(rows.length).toBe(4);
    expect(rows.every((row) => row.dataset.progress === undefined)).toBe(true);
  });
});
