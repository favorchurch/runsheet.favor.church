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
jest.mock('@/lib/richText', () => ({
  htmlToPlainText: (s: string) => s,
  legacyValueToHtml: (s: string) => s,
  sanitizeRichText: (s: string) => s,
  RICH_TEXT_ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'span', 'br', 'ul', 'ol', 'li', 'a'],
  RICH_TEXT_ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'rel'],
}));

import '@testing-library/jest-dom';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('RunsheetTableEditor dirty state', () => {
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
    { id: 2, key: 'DESCRIPTION', name: 'Description' },
    { id: 3, key: 'WORSHIPLEADER', name: 'Worship Leader' },
  ];

  const initialItems: RunsheetItemRow[] = [
    {
      id: 101,
      title: 'Welcome & Announcements',
      order: 1,
      startDateTime: '2026-08-16T10:00:00.000Z',
      duration: 5,
      attributeValues: { ACTIVITYTITLE: 'Welcome & Announcements', DESCRIPTION: 'Greeting the church' },
    },
    {
      id: 102,
      title: 'Praise & Worship',
      order: 2,
      startDateTime: '2026-08-16T10:05:00.000Z',
      duration: 15,
      attributeValues: { ACTIVITYTITLE: 'Praise & Worship', DESCRIPTION: '3 songs' },
    },
  ];

  test('does NOT mark editor dirty on initial render when no edits are made', () => {
    const onDirtyChange = jest.fn();

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00 AM"
        onDirtyChange={onDirtyChange}
      />
    );

    // After render, onDirtyChange should have been called with false (or last call should be false)
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test('marks editor dirty when only the Start Time field is edited', () => {
    const onDirtyChange = jest.fn();

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onDirtyChange={onDirtyChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '09:30:00 AM' } });

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  test('saves an edited Start Time on its own, independent of the channel name/subtitle', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="MNL // August 16, 2026 // 10AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="09:00:00 AM"
        initialSubtitle="Sunday Service"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '09:30:00 AM' } });

    await saveFn?.();

    // 6th arg is the persisted Start Time value — the channel name/subtitle
    // are untouched (subtitle passed through unchanged as the 5th arg).
    expect(rockBulkSaveRunsheetItems).toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      columns,
      'Sunday Service',
      '09:30:00 AM'
    );
  });

  test('a newly added row can be dragged to the top, and the save reflects the new order', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    const { container } = render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    // Adding a row pushes it past the auto-injected "Roster: ..." placeholders
    // in the underlying items array — the exact setup that used to desync
    // visible row position from raw array position and silently break drag.
    fireEvent.click(screen.getByText('Add Row'));

    const dragHandles = screen.getAllByTitle('Drag handle cell to move whole row');
    expect(dragHandles).toHaveLength(3);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);

    fireEvent.dragStart(dragHandles[2]);
    fireEvent.drop(rows[0]);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const newRowEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'New Segment'
    );
    expect(newRowEntry?.order).toBe(1);
  });

  test('a card can be reordered with the Move Up button in Card view', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByText('Add Row'));
    fireEvent.click(screen.getByText('Cards'));

    const moveUpButtons = screen.getAllByTitle('Move up');
    expect(moveUpButtons).toHaveLength(3);

    // The new row is the last card (index 2) — move it up one slot, past "Praise & Worship".
    fireEvent.click(moveUpButtons[2]);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const newRowEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'New Segment'
    );
    expect(newRowEntry?.order).toBe(2);
  });

  test('a card can be moved down with the Move Down button in Card view', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByText('Cards'));

    // Move "Welcome & Announcements" (index 0) down past "Praise & Worship".
    const moveDownButtons = screen.getAllByTitle('Move down');
    expect(moveDownButtons).toHaveLength(2);
    fireEvent.click(moveDownButtons[0]);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const welcomeEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'Welcome & Announcements'
    );
    const praiseEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'Praise & Worship'
    );
    expect(praiseEntry?.order).toBe(1);
    expect(welcomeEntry?.order).toBe(2);
  });

  test('the Card view Duration field accepts seconds', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({ success: true, channels: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByText('Cards'));
    fireEvent.click(screen.getAllByText('Edit Card')[0]);

    const durationInput = screen.getByPlaceholderText('00:05:00');
    fireEvent.change(durationInput, { target: { value: '00:05:30' } });
    fireEvent.blur(durationInput);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const welcomeEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'Welcome & Announcements'
    );
    expect(welcomeEntry?.duration).toBe(5.5);
  });

  test('editing a duration updates the correct row even when a previously-assigned roster row sorts ahead of it', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({ success: true, channels: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    // Once a roster role (e.g. "Roster: Music Director") has ever been assigned,
    // it becomes a real ContentChannelItem in Rock with a large negative Order —
    // so on the next load, Rock returns it (sorted `Order asc`) BEFORE the real
    // segments. `ensureRosterItems` only appends still-unassigned roles; it
    // never reorders one already present, so this hidden row sits ahead of
    // "Welcome & Announcements" and "Praise & Worship" in the raw items array
    // from the very first render — no drag-and-drop needed to trigger it.
    const itemsWithAssignedRoster: RunsheetItemRow[] = [
      {
        id: 555,
        title: 'Roster: Music Director',
        order: -99,
        duration: 0,
        attributeValues: { ACTIVITYTITLE: 'Roster: Music Director' },
      },
      ...initialItems,
    ];

    const { container } = render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={itemsWithAssignedRoster}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    // Edit the duration of the 2nd visible row, "Praise & Worship" — raw
    // items[1] is actually "Welcome & Announcements" in this setup (index 0 is
    // the roster row), which is exactly the mismatch the old code fell for.
    const durationCells = screen.getAllByTitle('Click to edit duration');
    expect(durationCells).toHaveLength(2);
    fireEvent.click(durationCells[1]);

    const durationInput = container.querySelector('tbody input') as HTMLInputElement;
    expect(durationInput).toBeTruthy();
    fireEvent.change(durationInput, { target: { value: '00:20:00' } });
    fireEvent.blur(durationInput);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const welcomeEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'Welcome & Announcements'
    );
    const praiseEntry = itemsToSave.find(
      (item: RunsheetItemRow) => (item.attributeValues?.ACTIVITYTITLE || item.title) === 'Praise & Worship'
    );
    expect(praiseEntry?.duration).toBe(20);
    expect(welcomeEntry?.duration ?? 5).toBe(5); // untouched
  });

  test('the Card view Activity Title field preserves spaces', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({ success: true, channels: [] });
    let saveFn: (() => Promise<boolean>) | undefined;

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00:00 AM"
        onSaveRef={(fn) => (saveFn = fn)}
      />
    );

    fireEvent.click(screen.getByText('Cards'));
    fireEvent.click(screen.getAllByText('Edit Card')[0]);

    const titleInput = screen.getByPlaceholderText('Enter activity title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Favor News' } });
    expect(titleInput.value).toBe('Favor News');
    fireEvent.blur(titleInput);

    await saveFn?.();

    const [, itemsToSave] = (rockBulkSaveRunsheetItems as jest.Mock).mock.calls[0];
    const welcomeEntry = itemsToSave.find((item: RunsheetItemRow) => item.id === 101);
    expect(welcomeEntry?.attributeValues?.ACTIVITYTITLE).toBe('Favor News');
  });
});
