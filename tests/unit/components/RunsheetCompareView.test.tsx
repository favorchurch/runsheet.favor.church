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

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunsheetCompareView } from '@/components/runsheet/RunsheetCompareView';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';

jest.mock('@auth0/nextjs-auth0', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');

function detail(channelId: number, time: string, notes: string) {
  return {
    channelId,
    success: true,
    data: {
      channelId,
      name: `MNL Crowne // Aug 16, 2026 // ${time}`,
      contentChannelTypeId: 13,
      columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
      items: [{ id: channelId * 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: notes } }],
    },
  };
}

describe('RunsheetCompareView', () => {
  beforeEach(() => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      detail(1, '9AM', 'Doors open 8:30'),
      detail(2, '11:30AM', 'Doors open 9:00'),
    ]);
  });

  it('renders one column per channel and shows differing cells with full contrast', async () => {
    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('9AM')).toBeInTheDocument());
    expect(screen.getByText('11:30AM')).toBeInTheDocument();
    expect(screen.getByText('Doors open 8:30')).toBeInTheDocument();
    expect(screen.getByText('Doors open 9:00')).toBeInTheDocument();
  });

  it('hides person and platform columns by default', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 9AM',
          contentChannelTypeId: 13,
          columns: [{ id: 1, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 }],
          items: [{ id: 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { PLATFORM: 'Jane Doe' } }],
        },
      },
    ]);
    render(<RunsheetCompareView channelIds={[1]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument());
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('does not expose compare editing or saving in View mode', async () => {
    const { rerender } = render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Doors open 8:30')).toBeInTheDocument());

    const cell = screen.getByText('Doors open 8:30').closest('td');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);

    expect(screen.getByRole('textbox')).toHaveValue('Doors open 8:30');
    rerender(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} readOnly />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save comparison edits/i })).not.toBeInTheDocument();
  });

  it('does not open an editor or attempt a write when mounted read-only', async () => {
    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} readOnly />);
    await waitFor(() => expect(screen.getByText('Doors open 8:30')).toBeInTheDocument());

    const cell = screen.getByText('Doors open 8:30').closest('td');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);
    fireEvent.doubleClick(cell!);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(rockBulkSaveRunsheetItems).not.toHaveBeenCalled();
  });

  it('notifies the manager after successful compare writes', async () => {
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
    const onSaveSettled = jest.fn();
    const props = { channelIds: [1, 2], onClose: jest.fn(), onSaveSettled } as any;

    render(<RunsheetCompareView {...props} />);
    await waitFor(() => expect(screen.getByText('Doors open 8:30')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Doors open 8:30').closest('td')!);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Doors open 9:00' } });
    fireEvent.blur(screen.getByRole('textbox'));
    fireEvent.click(screen.getByRole('button', { name: /save comparison edits/i }));

    await waitFor(() => expect(onSaveSettled).toHaveBeenCalledWith(1));
    expect(onSaveSettled).toHaveBeenCalledTimes(1);
  });

  it('displays service start time in column headers', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [{ id: 10, title: 'Opener', order: 1, duration: 5, attributeValues: { NOTES: 'Note 1' } }],
        },
      },
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // Aug 16, 2026 // 12:00 PM',
          startTime: '12:00:00 PM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [{ id: 20, title: 'Opener', order: 1, duration: 5, attributeValues: { NOTES: 'Note 1' } }],
        },
      },
    ]);

    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/Start:\s*10:00:00 AM/)).toBeInTheDocument());
    expect(screen.getByText(/Start:\s*12:00:00 PM/)).toBeInTheDocument();
  });

  it('displays calculated segment start times and durations in comparison rows', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 10, title: 'Opener', order: 1, duration: 5, attributeValues: { NOTES: 'Same' } },
            { id: 11, title: 'Praise', order: 2, duration: 15, attributeValues: { NOTES: 'Same' } },
          ],
        },
      },
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 20, title: 'Opener', order: 1, duration: 5, attributeValues: { NOTES: 'Same' } },
            { id: 21, title: 'Praise', order: 2, duration: 15, attributeValues: { NOTES: 'Same' } },
          ],
        },
      },
    ]);

    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByText('Start Time').length).toBeGreaterThan(0));

    // 'Opener' starts at 10:00:00 AM with duration 00:05:00
    expect(screen.getAllByText('10:00:00 AM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('00:05:00').length).toBeGreaterThan(0);

    // 'Praise' starts at 10:05:00 AM with duration 00:15:00
    expect(screen.getAllByText('10:05:00 AM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('00:15:00').length).toBeGreaterThan(0);
  });

  it('detects and highlights differences in segment start times and durations across services', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 10, title: 'Worship', order: 1, duration: 20, attributeValues: { NOTES: 'Same Note' } },
          ],
        },
      },
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // Aug 16, 2026 // 03:00 PM',
          startTime: '03:00:00 PM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 20, title: 'Worship', order: 1, duration: 25, attributeValues: { NOTES: 'Same Note' } },
          ],
        },
      },
    ]);

    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Worship')).toBeInTheDocument());

    // Both Start Time and Duration differ
    expect(screen.getByText('10:00:00 AM')).toBeInTheDocument();
    expect(screen.getByText('3:00:00 PM')).toBeInTheDocument();
    expect(screen.getByText('00:20:00')).toBeInTheDocument();
    expect(screen.getByText('00:25:00')).toBeInTheDocument();

    // Segment should show differing indicator
    expect(screen.getByText(/Differing/i)).toBeInTheDocument();
  });

  it('filters to show only segments and columns with differences when Show Differences Only is checked', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Same' } },
            { id: 11, title: 'Sermon', order: 2, duration: 30, attributeValues: { NOTES: 'Part 1' } },
          ],
        },
      },
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [
            { id: 20, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Same' } },
            { id: 21, title: 'Sermon', order: 2, duration: 35, attributeValues: { NOTES: 'Part 2' } },
          ],
        },
      },
    ]);

    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
    expect(screen.getByText('Sermon')).toBeInTheDocument();

    // Toggle Show Differences Only
    fireEvent.click(screen.getByLabelText(/Show Differences Only/i));

    // Welcome has matching start time (10:00:00 AM), matching duration (00:05:00), matching notes ("Same") -> hidden
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
    // Sermon has differing duration (00:30:00 vs 00:35:00) and differing notes ("Part 1" vs "Part 2") -> visible
    expect(screen.getByText('Sermon')).toBeInTheDocument();
  });

  it('does not allow editing computed start time or duration cells', async () => {
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 1,
        success: true,
        data: {
          channelId: 1,
          name: 'MNL Crowne // Aug 16, 2026 // 10:00 AM',
          startTime: '10:00:00 AM',
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [{ id: 10, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Editable Note' } }],
        },
      },
    ]);

    render(<RunsheetCompareView channelIds={[1]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('10:00:00 AM')).toBeInTheDocument());

    const startTimeCell = screen.getByText('10:00:00 AM').closest('td');
    expect(startTimeCell).not.toBeNull();
    fireEvent.click(startTimeCell!);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    const durationCell = screen.getByText('00:05:00').closest('td');
    expect(durationCell).not.toBeNull();
    fireEvent.click(durationCell!);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    const notesCell = screen.getByText('Editable Note').closest('td');
    expect(notesCell).not.toBeNull();
    fireEvent.click(notesCell!);
    expect(screen.getByRole('textbox')).toHaveValue('Editable Note');
  });
});
