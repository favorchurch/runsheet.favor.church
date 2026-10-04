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
import { render, fireEvent } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

/**
 * Table-view drag reordering.
 *
 * Pins both directions of a table-view row drag, including a non-adjacent downward
 * move, and the `order` values actually shipped to Rock on save.
 */
describe('RunsheetTableEditor table drag reordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  const columns: DynamicAttributeColumn[] = [
    { id: 1, key: 'ACTIVITYTITLE', name: 'Activity' },
    { id: 2, key: 'DESCRIPTION', name: 'Description' },
  ];

  /** Four rows, so a non-adjacent downward move is distinguishable from an adjacent one. */
  const initialItems: RunsheetItemRow[] = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({
    id: 101 + index,
    title: name,
    order: index + 1,
    startDateTime: `2026-08-16T10:${String(index * 5).padStart(2, '0')}:00.000Z`,
    duration: 5,
    attributeValues: { ACTIVITYTITLE: name, DESCRIPTION: `${name} description` },
  }));

  function renderEditor() {
    let saveFn: (() => Promise<boolean>) | undefined;
    const view = render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />,
    );

    const rows = () => Array.from(view.container.querySelectorAll('tbody tr'));
    const handles = () => Array.from(view.container.querySelectorAll('td[title="Drag handle cell to move whole row"]'));
    return { view, rows, handles, getSaveFn: () => saveFn };
  }

  /**
   * Drives the pointer-based row drag (mouse, touch or pen) from a handle onto a row.
   * jsdom has no layout, so `elementFromPoint` is stubbed to report the target row.
   */
  function dragRow(handles: Element[], rows: Element[], from: number, to: number) {
    const original = document.elementFromPoint;
    document.elementFromPoint = () => rows[to];
    try {
      fireEvent.pointerDown(handles[from], { pointerId: 1, pointerType: 'touch', button: 0 });
      fireEvent.pointerMove(handles[from], { pointerId: 1, pointerType: 'touch' });
      fireEvent.pointerUp(handles[from], { pointerId: 1, pointerType: 'touch' });
    } finally {
      document.elementFromPoint = original;
    }
  }

  /** Visible row order, read from the Activity Title cell of each row. */
  function visibleOrder(rows: Element[]): string[] {
    return rows.map((row) => {
      const text = row.textContent || '';
      return ['Alpha', 'Bravo', 'Charlie', 'Delta'].find((name) => text.includes(name)) || '?';
    });
  }

  /**
   * The `order` values actually shipped to Rock, keyed by activity title.
   * Only CHANGED rows are sent, so a row that did not move is legitimately absent —
   * asserting on the exact map therefore also pins which rows the reorder touched.
   */
  async function savedOrder(saveFn: (() => Promise<boolean>) | undefined): Promise<Record<string, number>> {
    await saveFn?.();
    expect(rockBulkSaveRunsheetItems as jest.Mock).toHaveBeenCalled();
    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const result: Record<string, number> = {};
    for (const item of itemsToSave as RunsheetItemRow[]) {
      const name = item.attributeValues?.ACTIVITYTITLE || item.title;
      if (name) result[name] = item.order as number;
    }
    return result;
  }

  test('a row can be dragged UP (regression guard — this direction already worked)', async () => {
    const { rows, handles, getSaveFn } = renderEditor();

    // Preconditions: fail loudly at setup rather than masquerading as the bug.
    expect(rows()).toHaveLength(4);
    expect(handles()).toHaveLength(4);
    expect(getSaveFn()).toBeDefined();
    expect(visibleOrder(rows())).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    dragRow(handles(), rows(), 2, 0); // Charlie onto Alpha's slot

    expect(visibleOrder(rows())).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    // Delta never moved, so it is correctly absent from the changed-rows payload.
    await expect(savedOrder(getSaveFn())).resolves.toEqual({ Charlie: 1, Alpha: 2, Bravo: 3 });
  });

  test('a row can be dragged DOWN by one slot (adjacent)', async () => {
    const { rows, handles, getSaveFn } = renderEditor();

    expect(rows()).toHaveLength(4);
    expect(handles()).toHaveLength(4);
    expect(getSaveFn()).toBeDefined();
    expect(visibleOrder(rows())).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    dragRow(handles(), rows(), 0, 1); // Alpha onto Bravo's slot

    // Before the fix this was a no-op: removing Alpha shifted Bravo back by exactly the
    // one slot being inserted into, landing Alpha right where it started.
    expect(visibleOrder(rows())).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
    await expect(savedOrder(getSaveFn())).resolves.toEqual({ Bravo: 1, Alpha: 2 });
  });

  test('a row can be dragged DOWN by more than one slot (non-adjacent)', async () => {
    const { rows, handles, getSaveFn } = renderEditor();

    expect(rows()).toHaveLength(4);
    expect(handles()).toHaveLength(4);
    expect(getSaveFn()).toBeDefined();
    expect(visibleOrder(rows())).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    dragRow(handles(), rows(), 0, 2); // Alpha onto Charlie's slot

    expect(visibleOrder(rows())).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
    await expect(savedOrder(getSaveFn())).resolves.toEqual({ Bravo: 1, Charlie: 2, Alpha: 3 });
  });
});
