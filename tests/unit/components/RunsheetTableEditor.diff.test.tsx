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
});
