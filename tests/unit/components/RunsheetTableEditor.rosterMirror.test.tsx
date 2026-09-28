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
/** Mutable so a test can model Rock having people, or having none. */
const rosterPeople: { personId: number; name: string }[] = [];

jest.mock('@/components/runsheet/runsheetQueries', () => ({
  ...jest.requireActual('@/components/runsheet/runsheetQueries'),
  // Rock knows this service but nobody is rostered yet — the state channel 121
  // (MNL Crowne // October 3, 2026 // 11:30AM) was in when this regressed.
  useRosterAssignments: () => ({
    data: {
      success: true,
      rockManaged: true,
      linked: true,
      scheduleId: 557,
      isoDate: '2026-10-03',
      roles: [
        { roleTitle: 'Roster: Service Director', people: rosterPeople },
        { roleTitle: 'Roster: Stage Manager Captain', people: [] },
      ],
    },
  }),
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
import { render, act, fireEvent, screen } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

/**
 * Simulates a pointer drag (mouse, touch or pen) from a drag handle onto a row.
 * jsdom has no layout, so `elementFromPoint` is stubbed to report `target`.
 */
function dragRowTo(handle: Element, target: Element) {
  const original = document.elementFromPoint;
  document.elementFromPoint = () => target;
  try {
    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: 'touch', button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'touch' });
  } finally {
    document.elementFromPoint = original;
  }
}

describe('RunsheetTableEditor roster mirror and dirty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    { id: 2, key: 'PLATFORM', name: 'Platform', fieldTypeId: 15 },
  ];

  /** A saved runsheet carrying roster names Rock no longer has anyone for. */
  const initialItems: RunsheetItemRow[] = [
    {
      id: 3627,
      title: 'Roster: Service Director',
      order: -100,
      duration: 0,
      attributeValues: { PLATFORM: 'Someone Previously Rostered' },
    },
    {
      id: 3628,
      title: 'Roster: Stage Manager Captain',
      order: -99,
      duration: 0,
      attributeValues: { PLATFORM: 'Another Person' },
    },
    {
      id: 3630,
      title: 'Runsheet Huddle',
      order: 1,
      duration: 5,
      attributeValues: { ACTIVITYTITLE: 'Runsheet Huddle' },
    },
  ];

  const render121 = (props: Record<string, unknown> = {}) =>
    render(
      <RunsheetTableEditor
        channelId={121}
        channelName="MNL Crowne // October 3, 2026 // 11:30AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="11:30 AM"
        {...props}
      />
    );

  test('saving an edited row clears the prompt while a Rock roster is linked', async () => {
    // Channel 122's real configuration: a live Rock roster mirrored into the
    // sheet, plus an ordinary row edit. Saving must settle the dirty state, or
    // Save stays clickable and leaving still prompts.
    rosterPeople.length = 0;
    rosterPeople.push({ personId: 10, name: 'Rostered In Rock' });
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({
      success: true,
      results: [{ ok: true, clientId: 3630, rockId: 3630 }],
    });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({ success: true, channels: [] });

    const onDirtyChange = jest.fn();
    let saveFn: (() => Promise<boolean>) | undefined;
    render(
      <RunsheetTableEditor
        channelId={122}
        channelName="MNL Crowne // October 4, 2026 // 11:30AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="11:30 AM"
        onDirtyChange={onDirtyChange}
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /card view/i }));
    fireEvent.click(screen.getAllByText('Edit Card')[0]);
    const titleInput = screen.getByPlaceholderText('Enter activity title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Changed Segment' } });
    fireEvent.blur(titleInput);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      await saveFn?.();
    });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test('a successful save survives the propagation lookup failing', async () => {
    // The propagate offer runs after Rock has already been written. When it
    // threw, the rejection escaped handleSave: Rock had the change, but the UI
    // still showed Save as pending and prompted "unsaved changes" on exit.
    rosterPeople.length = 0;
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({
      success: true,
      results: [{ ok: true, clientId: 3630, rockId: 3630 }],
    });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockRejectedValue(new Error('Rock unreachable'));

    const onDirtyChange = jest.fn();
    let saveFn: (() => Promise<boolean>) | undefined;
    render(
      <RunsheetTableEditor
        channelId={122}
        channelName="MNL Crowne // October 4, 2026 // 11:30AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="11:30 AM"
        onDirtyChange={onDirtyChange}
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /card view/i }));
    fireEvent.click(screen.getAllByText('Edit Card')[0]);
    const titleInput = screen.getByPlaceholderText('Enter activity title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Changed Segment' } });
    fireEvent.blur(titleInput);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await saveFn?.();
    });

    // The save reports success, so "Save & Leave" completes and the prompt closes.
    expect(saved).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test('a populated Rock roster stays clean across a details refetch', () => {
    // The regression behind channel 122: the baseline is rebuilt from the
    // *stored* rows whenever initialItems changes, which undid the mirror's
    // re-baseline and left the runsheet permanently dirty with nothing to save.
    rosterPeople.length = 0;
    rosterPeople.push({ personId: 10, name: 'Rostered In Rock' });

    const onDirtyChange = jest.fn();
    const { rerender } = render(
      <RunsheetTableEditor
        channelId={122}
        channelName="MNL Crowne // October 4, 2026 // 11:30AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="11:30 AM"
        onDirtyChange={onDirtyChange}
      />
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    // A refetch hands down a new array with the same stored (stale) contents.
    onDirtyChange.mockClear();
    rerender(
      <RunsheetTableEditor
        channelId={122}
        channelName="MNL Crowne // October 4, 2026 // 11:30AM"
        columns={columns}
        initialItems={initialItems.map((item) => ({ ...item }))}
        initialStartTime="11:30 AM"
        onDirtyChange={onDirtyChange}
      />
    );

    // onDirtyChange only fires on a change, so "never called with true" is the
    // invariant: the refetch must not turn a clean runsheet dirty.
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  test('syncing an empty Rock roster does not make an untouched runsheet dirty', () => {
    rosterPeople.length = 0;
    const onDirtyChange = jest.fn();
    render121({ onDirtyChange });

    // The mirror blanks two saved roster names here. That is Rock's answer, not
    // the user's edit, so nothing should be pending — otherwise the runsheet
    // prompts "save or discard" the moment it loads.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test('stays clean in view mode, where the save that the prompt offers cannot run', () => {
    rosterPeople.length = 0;
    const onDirtyChange = jest.fn();
    render121({ onDirtyChange, readOnly: true });

    // readOnly makes handleSave return false immediately, so a dirty view-mode
    // runsheet can only ever be left by discarding.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

});
