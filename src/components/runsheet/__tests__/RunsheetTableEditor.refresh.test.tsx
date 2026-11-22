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
 * A refetch must never leave the editor showing older rows than Rock while its
 * Save baseline moves on to Rock's rows. Save diffs the rows on screen against
 * that baseline, so the older rows would read as edits and be written back over
 * newer content (the "my saved notes reverted overnight" report).
 */
describe('RunsheetTableEditor refresh while open', () => {
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

  function makeRows(notes: Record<string, string> = {}): RunsheetItemRow[] {
    return ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({
      id: 101 + index,
      title: name,
      order: index + 1,
      startDateTime: `2026-08-16T10:${String(index * 5).padStart(2, '0')}:00.000Z`,
      duration: 5,
      attributeValues: { ACTIVITYTITLE: name, DESCRIPTION: notes[name] ?? `${name} old notes` },
    }));
  }

  function renderEditor(initialItems: RunsheetItemRow[]) {
    let saveFn: (() => Promise<boolean>) | undefined;
    const element = (items: RunsheetItemRow[]) => (
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={items}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );
    const view = render(element(initialItems));
    return {
      view,
      refetch: (items: RunsheetItemRow[]) => view.rerender(element(items)),
      rows: () => Array.from(view.container.querySelectorAll('tbody tr')),
      handles: () => Array.from(view.container.querySelectorAll('td[title="Drag handle cell to move whole row"]')),
      text: () => view.container.textContent || '',
      getSaveFn: () => saveFn,
    };
  }

  test('opened on older rows, then Rock answers with newer ones: shows them and has nothing to save', async () => {
    const { refetch, text, getSaveFn } = renderEditor(makeRows());
    expect(text()).toContain('Bravo old notes');

    refetch(makeRows({ Bravo: 'Bravo NEW notes' }));

    expect(text()).toContain('Bravo NEW notes');
    expect(text()).not.toContain('Bravo old notes');

    // Before the fix the screen kept the old notes while the baseline moved to the
    // new ones, so this Save wrote "Bravo old notes" back over Rock.
    await getSaveFn()?.();
    expect(rockBulkSaveRunsheetItems as jest.Mock).not.toHaveBeenCalled();
  });

  test('a refetch that matches the screen changes nothing', async () => {
    const { refetch, text, getSaveFn } = renderEditor(makeRows());

    refetch(makeRows());

    expect(text()).toContain('Bravo old notes');
    await getSaveFn()?.();
    expect(rockBulkSaveRunsheetItems as jest.Mock).not.toHaveBeenCalled();
  });

  test('with unsaved edits, a refetch keeps them and Save sends only what the user changed', async () => {
    const { refetch, rows, handles, getSaveFn } = renderEditor(makeRows());

    const original = document.elementFromPoint;
    document.elementFromPoint = () => rows()[0];
    try {
      // The user drags Charlie to the top: an unsaved edit.
      fireEvent.pointerDown(handles()[2], { pointerId: 1, pointerType: 'touch', button: 0 });
      fireEvent.pointerMove(handles()[2], { pointerId: 1, pointerType: 'touch' });
      fireEvent.pointerUp(handles()[2], { pointerId: 1, pointerType: 'touch' });
    } finally {
      document.elementFromPoint = original;
    }

    // Meanwhile someone else saved new Delta notes and Rock answers with them.
    refetch(makeRows({ Delta: 'Delta NEW notes' }));

    await getSaveFn()?.();
    expect(rockBulkSaveRunsheetItems as jest.Mock).toHaveBeenCalled();
    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const sent = itemsToSave as RunsheetItemRow[];

    // Only the reordered rows go out, and none of them carries a notes write that
    // would revert someone else's newer text.
    expect(sent.map((item) => item.attributeValues?.ACTIVITYTITLE).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    for (const item of sent) {
      expect(item.changedKeys).toEqual(['order']);
    }
  });
});
