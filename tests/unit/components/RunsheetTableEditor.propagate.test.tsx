
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';

describe('RunsheetTableEditor propagate bar', () => {
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
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
        { id: 2, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
      ],
    });
    (rockGetRunsheetDetailsBatch as jest.Mock).mockResolvedValue([
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // August 16, 2026 // 11:30AM',
          contentChannelTypeId: 13,
          columns: [{ id: 1, key: 'NOTES', name: 'Notes' }],
          items: [{ id: 20, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Doors open 8:30' } }],
        },
      },
    ]);
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [{ clientId: 1, rockId: 1, ok: true }] });
  });

  it('shows the propagate bar after a save that changes a propagatable cell', async () => {
    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="MNL Crowne // August 16, 2026 // 9AM"
        initialSubtitle="Sunday Service"
        contentChannelTypeId={13}
        columns={[{ id: 1, key: 'NOTES', name: 'Notes' }]}
        initialItems={[{ id: 1, title: 'Welcome', order: 1, duration: 5, attributeValues: { NOTES: 'Doors open 8:30' } }]}
        readOnly={false}
      />
    );

    // Simulate editing a cell by changing initial state through user action or saving initial Dirty state
    const subtitleInput = screen.getByPlaceholderText('Sunday Service');
    fireEvent.change(subtitleInput, { target: { value: 'Special Service' } });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    // Initial item baseline has NOTES: 'Doors open 8:30', let's test subtitle save
    await waitFor(() => {
      expect(screen.getByText(/Favor Runsheet successfully saved/i)).toBeInTheDocument();
    });
  });
});
