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
import { QueryClient, QueryClientProvider } from 'react-query';
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
  RunsheetCompareView: ({ channelIds, availableChannels, onSelectionChange, onClose }: {
    channelIds: number[];
    availableChannels?: any[];
    onSelectionChange?: (ids: number[]) => void;
    onClose: () => void;
  }) => (
    <div data-testid="compare-view" data-channels={availableChannels?.map((c) => c.id).join(',')}>
      {channelIds.join(',')}
      <button onClick={() => onSelectionChange?.([1, 2])}>select-all</button>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

function renderManager(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

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

  it('opens the compare view with available runsheets when Compare is clicked and binds selection', async () => {
    renderManager(<RunsheetManager user={{ email: 'editor@favor.church', roles: ['Runsheet.Editor'] } as any} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /compare/i })).toBeInTheDocument());

    const compareButton = screen.getByRole('button', { name: /compare/i });
    expect(compareButton).toBeEnabled();

    fireEvent.click(compareButton);
    const compareView = screen.getByTestId('compare-view');
    expect(compareView).toBeInTheDocument();
    expect(compareView).toHaveAttribute('data-channels', '1,2');

    // Test selection change callback
    fireEvent.click(screen.getByRole('button', { name: 'select-all' }));
    expect(screen.getByTestId('compare-view')).toHaveTextContent('1,2');
  });
});
