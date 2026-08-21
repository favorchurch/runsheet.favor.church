/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { canUserEditRunsheet } from '@/lib/permissions';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({ assertAuthenticated: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/lib/permissions', () => ({ canUserEditRunsheet: jest.fn().mockReturnValue(false) }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetails');
jest.mock('@/components/runsheet/CreateRunsheetForm', () => ({ CreateRunsheetForm: () => null }));
jest.mock('@/components/runsheet/RunsheetCompareView', () => ({ RunsheetCompareView: () => null }));
jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({
  RunsheetTableEditor: ({ channelId }: { channelId: number }) => (
    <div data-testid="runsheet-editor" data-channel-id={channelId} />
  ),
}));

const mockCanUserEditRunsheet = jest.mocked(canUserEditRunsheet);
const mockGetAvailableRunsheetChannels = jest.mocked(rockGetAvailableRunsheetChannels);
const mockGetRunsheetDetails = jest.mocked(rockGetRunsheetDetails);

const details = (channelId: number) => ({
  success: true as const,
  data: {
    channelId,
    name: `MNL Service // August 17, 2099 // ${channelId}AM`,
    subtitle: '',
    startTime: '',
    contentChannelTypeId: 13,
    columns: [],
    items: [],
  },
});

function renderManager(initialChannelId?: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RunsheetManager user={{ access: { runsheetCampuses: ['MNL'] } } as any} initialChannelId={initialChannelId} />
    </QueryClientProvider>,
  );
  return {
    ...result,
    rerenderManager: (nextInitialChannelId?: number) =>
      result.rerender(
        <QueryClientProvider client={queryClient}>
          <RunsheetManager user={{ access: { runsheetCampuses: ['MNL'] } } as any} initialChannelId={nextInitialChannelId} />
        </QueryClientProvider>,
      ),
  };
}

describe('RunsheetManager progressive loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUserEditRunsheet.mockReturnValue(false);
    mockGetAvailableRunsheetChannels.mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Service // August 17, 2099 // 1AM', time: '1AM' },
        { id: 2, name: 'MNL Service // August 17, 2099 // 2AM', time: '2AM' },
      ],
    });
  });

  it('renders accessible skeleton table rows while selected detail data is unavailable', async () => {
    mockGetRunsheetDetails.mockImplementation(() => new Promise(() => undefined));

    renderManager(1);

    expect(screen.getByTestId('runsheet-table-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading runsheet/i })).toBeInTheDocument();
    expect(screen.queryByTestId('runsheet-editor')).not.toBeInTheDocument();
  });

  it('reuses cached details when a user returns to a previously selected channel', async () => {
    mockGetRunsheetDetails.mockImplementation(async (channelId) => details(channelId));

    renderManager();
    await waitFor(() => expect(screen.getByTestId('runsheet-card-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('runsheet-card-1'));
    await waitFor(() => expect(mockGetRunsheetDetails).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    await waitFor(() => expect(mockGetRunsheetDetails).toHaveBeenCalledWith(2));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });

    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toBeInTheDocument());
    expect(mockGetRunsheetDetails.mock.calls.filter(([id]) => id === 1)).toHaveLength(1);
  });

  it('synchronizes the mounted manager when the route prop changes channels', async () => {
    const { rerenderManager } = renderManager(1);

    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-channel-id', '1'));

    rerenderManager(2);

    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-channel-id', '2'));
    expect(mockGetRunsheetDetails).toHaveBeenCalledWith(2);
  });
});
