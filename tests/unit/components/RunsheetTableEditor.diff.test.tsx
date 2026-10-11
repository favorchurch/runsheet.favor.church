/**
 * @jest-environment jsdom
 */
import { TextDecoder, TextEncoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof (global as any).Request === 'undefined') {
  (global as any).Request = class Request {};
}
if (typeof (global as any).Response === 'undefined') {
  (global as any).Response = class Response {};
}

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditorDiff';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';

jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');
jest.mock('@auth0/nextjs-auth0', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/components/runsheet/RichTextContent', () => ({
  RichTextContent: ({ value }: { value: string }) => <span>{value}</span>,
}));
jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({
  RunsheetTableEditor: ({ onDirtyChange, readOnly }: { onDirtyChange?: (dirty: boolean) => void; readOnly?: boolean }) => (
    <div data-testid="base-runsheet-editor" data-read-only={readOnly ? 'true' : 'false'}>
      <button type="button" onClick={() => onDirtyChange?.(true)}>mark-dirty</button>
    </div>
  ),
}));

const mockChannels = jest.mocked(rockGetAvailableRunsheetChannels);
const mockBatch = jest.mocked(rockGetRunsheetDetailsBatch);
const mockWrite = jest.mocked(rockBulkSaveRunsheetItems);

const sourceItems = [
  { id: 1, title: 'Runsheet Huddle', order: 1, duration: 5, attributeValues: { ACTIVITYTITLE: 'Runsheet Huddle', NOTES: 'Same' } },
  { id: 2, title: 'Doors Open', order: 2, duration: 10, attributeValues: { ACTIVITYTITLE: 'Doors Open', NOTES: 'Current' } },
  { id: 3, title: 'Pre-roll', order: 3, duration: 5, attributeValues: { ACTIVITYTITLE: 'Pre-roll', NOTES: 'Remove me' } },
];

const targetItems = [
  { id: 11, title: 'Runsheet Huddle', order: 1, duration: 5, attributeValues: { ACTIVITYTITLE: 'Runsheet Huddle', NOTES: 'Same' } },
  { id: 12, title: 'Doors Open', order: 2, duration: 10, attributeValues: { ACTIVITYTITLE: 'Doors Open', NOTES: 'Diff value' } },
  { id: 13, title: 'Pre-roll', order: 3, duration: 5, attributeValues: { ACTIVITYTITLE: 'Pre-roll', NOTES: '' } },
  { id: 14, title: 'Extra Segment', order: 4, duration: 5, attributeValues: { ACTIVITYTITLE: 'Extra Segment', NOTES: 'Added value' } },
];

function renderEditor(readOnly = true) {
  return render(
    <RunsheetTableEditor
      channelId={1}
      channelName="MNL Crowne // September 6, 2026 // 3PM"
      columns={[{ id: 101, key: 'NOTES', name: 'Notes' }]}
      initialItems={sourceItems as any}
      initialStartTime="2:00:00 PM"
      readOnly={readOnly}
    />,
  );
}

describe('RunsheetTableEditor inline service Diff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // September 6, 2026 // 3PM', time: '3PM' },
        { id: 2, name: 'MNL Crowne // September 6, 2026 // 5:30PM', time: '5:30PM' },
      ],
    });
    mockBatch.mockResolvedValue([
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // September 6, 2026 // 5:30PM',
          startTime: '4:30:00 PM',
          contentChannelTypeId: 13,
          columns: [{ id: 101, key: 'NOTES', name: 'Notes' }],
          items: targetItems as any,
        },
      },
    ]);
  });

  test('is available to a view-only user and renders same/change/remove/add in the existing column footprint', async () => {
    renderEditor(true);

    const plus = await screen.findByRole('button', { name: 'Choose service to diff' });
    expect(plus).toBeEnabled();
    fireEvent.click(plus);
    fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });

    const table = await screen.findByTestId('inline-service-diff-table');
    expect(table).toBeInTheDocument();
    expect(mockBatch).toHaveBeenCalledWith([2]);
    expect(table.querySelectorAll('[data-diff-status="same"]').length).toBeGreaterThan(0);
    expect(table.querySelectorAll('[data-diff-status="changed"]').length).toBeGreaterThan(0);
    expect(table.querySelectorAll('[data-diff-status="removed"]').length).toBeGreaterThan(0);
    expect(table.querySelectorAll('[data-diff-status="added"]').length).toBeGreaterThan(0);
    expect(screen.getByText('Added in 5:30PM')).toBeInTheDocument();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('red minus clears Diff and leaves the base editor mounted without writing', async () => {
    renderEditor(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose service to diff' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });
    await screen.findByTestId('inline-service-diff-table');

    fireEvent.click(screen.getByRole('button', { name: 'Clear inline diff' }));
    await waitFor(() => expect(screen.queryByTestId('inline-service-diff-table')).not.toBeInTheDocument());
    expect(screen.getByTestId('base-runsheet-editor')).toBeInTheDocument();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('does not allow entering Diff while the source editor has unsaved changes', async () => {
    renderEditor(false);
    await screen.findByRole('button', { name: 'Choose service to diff' });
    fireEvent.click(screen.getByRole('button', { name: 'mark-dirty' }));

    expect(screen.getByRole('button', { name: 'Choose service to diff' })).toBeDisabled();
    expect(screen.getByText('Save changes before diffing.')).toBeInTheDocument();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  describe('Mobile card diff view and Changes-only filter', () => {
    const cardDiffSourceItems = [
      {
        id: 2,
        title: 'Unchanged Segment',
        order: 1,
        duration: 10,
        attributeValues: {
          ACTIVITYTITLE: 'Unchanged Segment',
          SONGS: 'Song C',
          PLATFORM: 'Worship Leader',
          NOTES: 'Everything stays same',
        },
      },
      {
        id: 1,
        title: 'Call to Worship',
        order: 2,
        duration: 5,
        attributeValues: {
          ACTIVITYTITLE: 'Call to Worship',
          SONGS: 'Song A, Song B',
          PLATFORM: 'Pastor John',
          NOTES: 'Welcome church and pray',
        },
      },
      {
        id: 3,
        title: 'Removed Closing',
        order: 3,
        duration: 5,
        attributeValues: {
          ACTIVITYTITLE: 'Removed Closing',
          SONGS: '',
          PLATFORM: 'Host',
          NOTES: 'Old talking points',
        },
      },
    ];

    const cardDiffTargetItems = [
      {
        id: 12,
        title: 'Unchanged Segment',
        order: 1,
        duration: 10,
        attributeValues: {
          ACTIVITYTITLE: 'Unchanged Segment',
          SONGS: 'Song C',
          PLATFORM: 'Worship Leader',
          NOTES: 'Everything stays same',
        },
      },
      {
        id: 11,
        title: 'Call to Worship',
        order: 2,
        duration: 8,
        attributeValues: {
          ACTIVITYTITLE: 'Call to Worship',
          SONGS: 'Song A, Song B, Song D', // changed songs
          PLATFORM: 'Pastor Sarah', // changed platform
          NOTES: 'Welcome church with testimony', // changed talking points
        },
      },
      {
        id: 14,
        title: 'Added Next Steps',
        order: 4,
        duration: 7,
        attributeValues: {
          ACTIVITYTITLE: 'Added Next Steps',
          SONGS: 'Closing Track',
          PLATFORM: 'Pastor Mike',
          NOTES: 'Announce groups',
        },
      },
    ];

    const diffColumns = [
      { id: 101, key: 'SONGS', name: 'Songs' },
      { id: 102, key: 'PLATFORM', name: 'Platform' },
      { id: 103, key: 'NOTES', name: 'Talking Points' },
    ];

    function renderCardDiffEditor() {
      mockBatch.mockResolvedValueOnce([
        {
          channelId: 2,
          success: true,
          data: {
            channelId: 2,
            name: 'MNL Crowne // September 6, 2026 // 5:30PM',
            startTime: '2:00:00 PM',
            contentChannelTypeId: 13,
            columns: diffColumns,
            items: cardDiffTargetItems as any,
          },
        },
      ]);

      return render(
        <RunsheetTableEditor
          channelId={1}
          channelName="MNL Crowne // September 6, 2026 // 3PM"
          columns={diffColumns}
          initialItems={cardDiffSourceItems as any}
          initialStartTime="2:00:00 PM"
          readOnly={true}
        />,
      );
    }

    test('renders changed fields with source struck and target yellow stacked under field label in card view', async () => {
      renderCardDiffEditor();

      // Open diff against service 2
      fireEvent.click(await screen.findByRole('button', { name: 'Choose service to diff' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });

      // Switch to Cards view mode
      const cardViewBtn = await screen.findByRole('button', { name: 'Card view' });
      fireEvent.click(cardViewBtn);

      const cardsContainer = await screen.findByTestId('inline-service-diff-cards');
      expect(cardsContainer).toBeInTheDocument();

      // Find the changed segment card (Call to Worship)
      const callToWorshipCard = screen.getAllByText('Call to Worship')[0].closest('[data-testid="diff-card"]') as HTMLElement;
      expect(callToWorshipCard).toBeInTheDocument();

      // Verify Duration (time) field stack
      const durationField = callToWorshipCard.querySelector('[data-diff-field="Duration"]');
      expect(durationField).toBeInTheDocument();
      expect(durationField?.querySelector('[data-diff-part="removed"]')).toHaveTextContent('00:05:00');
      expect(durationField?.querySelector('[data-diff-part="added"]')).toHaveTextContent('00:08:00');

      // Verify Songs field stack
      const songsField = callToWorshipCard.querySelector('[data-diff-field="Songs"]');
      expect(songsField).toBeInTheDocument();
      expect(songsField?.querySelector('[data-diff-part="removed"]')).toHaveTextContent('Song A, Song B');
      expect(songsField?.querySelector('[data-diff-part="added"]')).toHaveTextContent('Song A, Song B, Song D');

      // Verify Platform field stack
      const platformField = callToWorshipCard.querySelector('[data-diff-field="Platform"]');
      expect(platformField).toBeInTheDocument();
      expect(platformField?.querySelector('[data-diff-part="removed"]')).toHaveTextContent('Pastor John');
      expect(platformField?.querySelector('[data-diff-part="added"]')).toHaveTextContent('Pastor Sarah');

      // Verify Talking Points / Notes field stack
      const notesField = callToWorshipCard.querySelector('[data-diff-field="Talking Points"]');
      expect(notesField).toBeInTheDocument();
      expect(notesField?.querySelector('[data-diff-part="removed"]')).toHaveTextContent('Welcome church and pray');
      expect(notesField?.querySelector('[data-diff-part="added"]')).toHaveTextContent('Welcome church with testimony');

      // Verify read-only / no writes
      expect(mockWrite).not.toHaveBeenCalled();
    });

    test('shows source-only (absent in comparison) and target-only (added in comparison) cards distinctly', async () => {
      renderCardDiffEditor();

      fireEvent.click(await screen.findByRole('button', { name: 'Choose service to diff' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });

      fireEvent.click(await screen.findByRole('button', { name: 'Card view' }));
      await screen.findByTestId('inline-service-diff-cards');

      // Check distinct badges for target-only (Added in 5:30PM) and source-only (Absent in 5:30PM)
      const addedBadge = screen.getByText('Added in 5:30PM');
      expect(addedBadge).toBeInTheDocument();
      const addedCard = addedBadge.closest('[data-testid="diff-card"]');
      expect(addedCard).toHaveAttribute('data-row-status', 'target-only');

      const absentBadge = screen.getByText('Absent in 5:30PM');
      expect(absentBadge).toBeInTheDocument();
      const absentCard = absentBadge.closest('[data-testid="diff-card"]');
      expect(absentCard).toHaveAttribute('data-row-status', 'source-only');
    });

    test('filters unchanged segments and unchanged fields when Changes only switch is activated', async () => {
      renderCardDiffEditor();

      fireEvent.click(await screen.findByRole('button', { name: 'Choose service to diff' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });

      fireEvent.click(await screen.findByRole('button', { name: 'Card view' }));
      await screen.findByTestId('inline-service-diff-cards');

      // In "All segments" mode, the unchanged card is rendered
      expect(screen.getAllByText('Unchanged Segment').length).toBeGreaterThan(0);
      const allCardsCount = screen.getAllByTestId('diff-card').length;
      expect(allCardsCount).toBe(4); // Call to Worship, Unchanged, Removed, Added

      // Toggle to "Changes only"
      const changesOnlyBtn = screen.getByRole('button', { name: 'Changes only' });
      fireEvent.click(changesOnlyBtn);
      expect(changesOnlyBtn).toHaveAttribute('aria-pressed', 'true');

      // The unchanged card should now be filtered out
      expect(screen.queryByText('Unchanged Segment')).not.toBeInTheDocument();
      const filteredCardsCount = screen.getAllByTestId('diff-card').length;
      expect(filteredCardsCount).toBe(3); // Call to Worship, Removed, Added

      // Within Call to Worship card, unchanged fields should not be displayed
      const callToWorshipCard = screen.getAllByText('Call to Worship')[0].closest('[data-testid="diff-card"]') as HTMLElement;
      // Activity title was unchanged ("Call to Worship" same in source and target), so title field stack should not be rendered
      expect(callToWorshipCard.querySelector('[data-diff-field="Activity Title"]')).not.toBeInTheDocument();

      // But changed fields (Duration, Songs, Platform, Talking Points) remain displayed
      expect(callToWorshipCard.querySelector('[data-diff-field="Duration"]')).toBeInTheDocument();
      expect(callToWorshipCard.querySelector('[data-diff-field="Songs"]')).toBeInTheDocument();
      expect(callToWorshipCard.querySelector('[data-diff-field="Platform"]')).toBeInTheDocument();
      expect(callToWorshipCard.querySelector('[data-diff-field="Talking Points"]')).toBeInTheDocument();

      // Switch back to "All segments"
      const allSegmentsBtn = screen.getByRole('button', { name: 'All segments' });
      fireEvent.click(allSegmentsBtn);
      expect(screen.getAllByText('Unchanged Segment').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('diff-card').length).toBe(4);
    });
  });
});
