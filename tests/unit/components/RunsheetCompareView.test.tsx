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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunsheetCompareView } from '@/components/runsheet/RunsheetCompareView';
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

  it('shows a Push to others action on a differing cell that opens the review panel', async () => {
    render(<RunsheetCompareView channelIds={[1, 2]} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Doors open 8:30')).toBeInTheDocument());

    const pushButtons = screen.getAllByRole('button', { name: /push/i });
    fireEvent.click(pushButtons[0]);

    await waitFor(() => expect(screen.getByRole('region', { name: /propagate/i })).toBeInTheDocument());
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
});
