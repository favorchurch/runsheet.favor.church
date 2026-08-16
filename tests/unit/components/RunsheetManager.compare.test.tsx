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
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/lib/permissions', () => ({ canUserEditRunsheet: jest.fn().mockReturnValue(true) }));
jest.mock('@/components/runsheet/RunsheetCompareView', () => ({
  RunsheetCompareView: ({ channelIds, onClose }: { channelIds: number[]; onClose: () => void }) => (
    <div data-testid="compare-view">{channelIds.join(',')}<button onClick={onClose}>close</button></div>
  ),
}));

describe('RunsheetManager compare entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
        { id: 2, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
      ],
    });
  });

  it('enables Compare only once 2 or more channels are checked, and opens the compare view with those ids', async () => {
    render(<RunsheetManager />);
    await waitFor(() => expect(screen.getAllByText(/9AM/)[0]).toBeInTheDocument());

    const compareButton = screen.getByRole('button', { name: /compare/i });
    expect(compareButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /select for compare/i })[0]);
    expect(compareButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /select for compare/i })[1]);
    expect(compareButton).toBeEnabled();

    fireEvent.click(compareButton);
    expect(screen.getByTestId('compare-view')).toHaveTextContent('1,2');
  });
});
