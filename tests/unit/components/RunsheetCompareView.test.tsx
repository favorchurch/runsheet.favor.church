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
});
