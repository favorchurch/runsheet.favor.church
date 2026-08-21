/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { RunsheetLandingView } from '@/components/runsheet/RunsheetLandingView';
import { prefetchRunsheetDetails } from '@/components/runsheet/runsheetQueries';

jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({ assertAuthenticated: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels', () => ({
  rockGetAvailableRunsheetChannels: jest.fn(),
}));
jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({
  rockGetRunsheetDetails: jest.fn(),
}));
jest.mock('@/components/runsheet/runsheetQueries', () => {
  const actual = jest.requireActual('@/components/runsheet/runsheetQueries');
  return {
    ...actual,
    prefetchRunsheetDetails: jest.fn(),
  };
});

const mockPrefetchRunsheetDetails = jest.mocked(prefetchRunsheetDetails);

const sampleChannels = [
  { id: 101, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' },
  { id: 102, name: 'BNE Service // August 9, 2026 // 5PM', time: '5PM' },
  { id: 103, name: 'SEL Service // August 16, 2026 // 11:30AM', time: '11:30AM' },
];

function renderLandingView(props: Partial<React.ComponentProps<typeof RunsheetLandingView>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaultProps = {
    channels: sampleChannels,
    isLoading: false,
    canEdit: true,
    showArchived: false,
    onToggleShowArchived: jest.fn(),
    onSelectChannel: jest.fn(),
    onCreateNew: jest.fn(),
    onPrefetchChannel: jest.fn(),
    accessScope: 'test-scope',
  };

  const combinedProps = { ...defaultProps, ...props };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RunsheetLandingView {...combinedProps} />
      </QueryClientProvider>,
    ),
    props: combinedProps,
  };
}

describe('RunsheetLandingView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders landing hero, cards, and campus badges', () => {
    renderLandingView();

    expect(screen.getByRole('heading', { name: /select a runsheet/i })).toBeInTheDocument();
    expect(screen.getByTestId('runsheet-card-101')).toBeInTheDocument();
    expect(screen.getByTestId('runsheet-card-102')).toBeInTheDocument();
    expect(screen.getAllByText('MNL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BNE').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SEL').length).toBeGreaterThanOrEqual(1);
  });

  it('preloads the top active runsheets in the background on mount', () => {
    const onPrefetchMock = jest.fn();
    renderLandingView({ onPrefetchChannel: onPrefetchMock });

    expect(onPrefetchMock).toHaveBeenCalledWith(101);
    expect(onPrefetchMock).toHaveBeenCalledWith(102);
    expect(onPrefetchMock).toHaveBeenCalledWith(103);
  });

  it('prefetches details on hover and focus over a card', () => {
    const onPrefetchMock = jest.fn();
    renderLandingView({ onPrefetchChannel: onPrefetchMock });
    onPrefetchMock.mockClear();

    const card = screen.getByTestId('runsheet-card-101');
    fireEvent.mouseEnter(card);
    expect(onPrefetchMock).toHaveBeenCalledWith(101);

    fireEvent.focus(card);
    expect(onPrefetchMock).toHaveBeenCalledWith(101);
  });

  it('calls onSelectChannel when a card is clicked', () => {
    const { props } = renderLandingView();

    const card = screen.getByTestId('runsheet-card-102');
    fireEvent.click(card);

    expect(props.onSelectChannel).toHaveBeenCalledWith(102);
  });

  it('filters runsheet cards by search text', () => {
    renderLandingView();

    const searchInput = screen.getByPlaceholderText(/search by campus/i);
    fireEvent.change(searchInput, { target: { value: 'BNE' } });

    expect(screen.queryByTestId('runsheet-card-101')).not.toBeInTheDocument();
    expect(screen.getByTestId('runsheet-card-102')).toBeInTheDocument();
    expect(screen.queryByTestId('runsheet-card-103')).not.toBeInTheDocument();
  });

  it('filters runsheet cards by campus pill', () => {
    renderLandingView();

    const mnlPill = screen.getByRole('button', { name: 'MNL' });
    fireEvent.click(mnlPill);

    expect(screen.getByTestId('runsheet-card-101')).toBeInTheDocument();
    expect(screen.queryByTestId('runsheet-card-102')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runsheet-card-103')).not.toBeInTheDocument();
  });

  it('renders friendly empty state when search matches nothing', () => {
    renderLandingView();

    const searchInput = screen.getByPlaceholderText(/search by campus/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Location' } });

    expect(screen.getByText(/no matching runsheets found/i)).toBeInTheDocument();
  });

  it('renders "+ Create New Runsheet" and "Show Archived" when canEdit is true', () => {
    const { props } = renderLandingView({ canEdit: true });

    const createButtons = screen.getAllByRole('button', { name: /create new runsheet/i });
    expect(createButtons.length).toBeGreaterThan(0);

    fireEvent.click(createButtons[0]);
    expect(props.onCreateNew).toHaveBeenCalled();

    const archivedCheckbox = screen.getByLabelText(/show archived/i);
    expect(archivedCheckbox).toBeInTheDocument();
    fireEvent.click(archivedCheckbox);
    expect(props.onToggleShowArchived).toHaveBeenCalledWith(true);
  });

  it('hides create and archived controls when canEdit is false', () => {
    renderLandingView({ canEdit: false });

    expect(screen.queryByRole('button', { name: /create new runsheet/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/show archived/i)).not.toBeInTheDocument();
  });

  it('sorts channels chronologically by date and sortable time signatures', () => {
    const unsortedChannels = [
      { id: 201, name: 'MNL Crowne // August 16, 2026 // 5PM', time: '5PM' },
      { id: 202, name: 'MNL Crowne // August 16, 2026 // 9AM', time: '9AM' },
      { id: 203, name: 'MNL Crowne // August 16, 2026 // 11:30AM', time: '11:30AM' },
      { id: 204, name: 'MNL Crowne // August 16, 2026 // 10AM', time: '10AM' },
      { id: 205, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' },
    ];

    renderLandingView({ channels: unsortedChannels });

    const cards = screen.getAllByRole('button', { name: /select runsheet/i });
    const renderedIds = cards.map((c) => Number(c.getAttribute('data-channel-id')));

    // Expected chronological order:
    // 1. Aug 9, 10AM (205)
    // 2. Aug 16, 9AM (202)
    // 3. Aug 16, 10AM (204)
    // 4. Aug 16, 11:30AM (203)
    // 5. Aug 16, 5PM (201)
    expect(renderedIds).toEqual([205, 202, 204, 203, 201]);
  });

  it('renders the time prominently with inline campus pill and location in the top badge', () => {
    renderLandingView({
      channels: [{ id: 301, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' }],
    });

    const heading = screen.getByRole('heading', { level: 3, name: '10AM' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('MNL')).toBeInTheDocument();
    expect(screen.getByText('MNL Crowne')).toBeInTheDocument();
  });
});
