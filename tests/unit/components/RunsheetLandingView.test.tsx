/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    runsheetCampuses: ['ALL'],
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
    window.localStorage.clear();
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

  it('filters runsheet cards by campus switcher', () => {
    renderLandingView();

    fireEvent.click(within(screen.getByRole('group', { name: 'Campus' })).getByRole('button', { name: 'MNL' }));

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
      { id: 201, name: 'MNL Crowne // December 16, 2099 // 5PM', time: '5PM' },
      { id: 202, name: 'MNL Crowne // December 16, 2099 // 9AM', time: '9AM' },
      { id: 203, name: 'MNL Crowne // December 16, 2099 // 11:30AM', time: '11:30AM' },
      { id: 204, name: 'MNL Crowne // December 16, 2099 // 10AM', time: '10AM' },
      { id: 205, name: 'MNL Crowne // December 9, 2099 // 10AM', time: '10AM' },
    ];

    renderLandingView({ channels: unsortedChannels });

    const cards = screen.getAllByRole('button', { name: /select runsheet/i });
    const renderedIds = cards.map((c) => Number(c.getAttribute('data-channel-id')));

    // Expected chronological order:
    // 1. Dec 9, 10AM (205)
    // 2. Dec 16, 9AM (202)
    // 3. Dec 16, 10AM (204)
    // 4. Dec 16, 11:30AM (203)
    // 5. Dec 16, 5PM (201)
    expect(renderedIds).toEqual([205, 202, 204, 203, 201]);
  });

  it('sorts archived/past channels newest-first', () => {
    const pastChannels = [
      { id: 205, name: 'MNL Crowne // August 9, 2020 // 10AM', time: '10AM' },
      { id: 201, name: 'MNL Crowne // August 16, 2020 // 5PM', time: '5PM' },
      { id: 202, name: 'MNL Crowne // August 16, 2020 // 9AM', time: '9AM' },
    ];

    renderLandingView({ channels: pastChannels, showArchived: true });

    const cards = screen.getAllByRole('button', { name: /select runsheet/i });
    const renderedIds = cards.map((c) => Number(c.getAttribute('data-channel-id')));

    // Newest past service first:
    // 1. Aug 16 5PM (201)
    // 2. Aug 16 9AM (202)
    // 3. Aug 9 10AM (205)
    expect(renderedIds).toEqual([201, 202, 205]);
  });

  it('renders the time prominently with inline campus pill and location in the top badge', () => {
    renderLandingView({
      channels: [{ id: 301, name: 'MNL Crowne // August 9, 2026 // 10AM', time: '10AM' }],
      runsheetCampuses: ['MNL'],
    });

    const heading = screen.getByRole('heading', { level: 3, name: '10AM' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('MNL')).toBeInTheDocument();
    expect(screen.getByText('MNL Crowne')).toBeInTheDocument();
  });

  it('opens the only campus template directly for a single-campus editor', () => {
    const onEditTemplate = jest.fn();
    renderLandingView({ onEditTemplate, templateCampuses: ['BNE'] });

    fireEvent.click(screen.getByRole('button', { name: /edit master template/i }));

    expect(onEditTemplate).toHaveBeenCalledWith('BNE');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers a campus choice when the editor spans several campuses', () => {
    const onEditTemplate = jest.fn();
    renderLandingView({ onEditTemplate, templateCampuses: ['MNL', 'BNE', 'SEL'] });

    fireEvent.click(screen.getByRole('button', { name: /edit master template/i }));
    expect(onEditTemplate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'SEL' }));
    expect(onEditTemplate).toHaveBeenCalledWith('SEL');
  });

  it('hides the button when the user has no campus template to edit', () => {
    renderLandingView({ onEditTemplate: jest.fn(), templateCampuses: [] });
    expect(screen.queryByRole('button', { name: /edit master template/i })).not.toBeInTheDocument();
  });

  describe('campus scope', () => {
    const cardIds = () =>
      screen.getAllByRole('button', { name: /select runsheet/i }).map((c) => Number(c.getAttribute('data-channel-id')));
    const switcher = () => screen.getByRole('group', { name: 'Campus' });

    it('shows a Global user the All/MNL/BNE/SEL switcher, defaulting to All', () => {
      renderLandingView({ runsheetCampuses: ['ALL'] });

      const buttons = within(switcher()).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['All', 'MNL', 'BNE', 'SEL']);
      expect(within(switcher()).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
      expect(cardIds().sort()).toEqual([101, 102, 103]);
    });

    it('remembers the last campus choice in this browser', async () => {
      const first = renderLandingView({ runsheetCampuses: ['ALL'] });
      fireEvent.click(within(switcher()).getByRole('button', { name: 'BNE' }));
      expect(cardIds()).toEqual([102]);
      expect(window.localStorage.getItem('runsheet_pref_campus')).toBe('BNE');
      first.unmount();

      renderLandingView({ runsheetCampuses: ['ALL'] });
      await waitFor(() =>
        expect(within(switcher()).getByRole('button', { name: 'BNE' })).toHaveAttribute('aria-pressed', 'true'),
      );
      expect(cardIds()).toEqual([102]);
    });

    it('still works when browser storage is blocked', () => {
      const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      try {
        renderLandingView({ runsheetCampuses: ['ALL'] });
        expect(within(switcher()).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(switcher()).getByRole('button', { name: 'SEL' }));
        expect(cardIds()).toEqual([103]);
      } finally {
        getItem.mockRestore();
        setItem.mockRestore();
      }
    });

    it('names the campus when the switcher filters every runsheet out', () => {
      renderLandingView({ runsheetCampuses: ['ALL'], channels: [sampleChannels[0]] });
      fireEvent.click(within(switcher()).getByRole('button', { name: 'SEL' }));
      expect(screen.getByText(/no active runsheets scheduled for SEL/i)).toBeInTheDocument();
    });

    it('hides the switcher and campus pills from a one-campus user', () => {
      window.localStorage.setItem('runsheet_pref_campus', 'BNE');
      renderLandingView({
        runsheetCampuses: ['MNL'],
        channels: [sampleChannels[0], { id: 104, name: 'MNL Crowne // August 9, 2026 // 5PM', time: '5PM' }],
      });

      expect(screen.queryByRole('group', { name: 'Campus' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'MNL' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
      expect(cardIds().sort()).toEqual([101, 104]);
    });

    it('keeps cross-campus rostered runsheets listed for a one-campus user, with no campus filter', () => {
      // A stored Global-era choice must not filter a one-campus user's list.
      window.localStorage.setItem('runsheet_pref_campus', 'MNL');
      renderLandingView({ runsheetCampuses: ['MNL'] });

      expect(screen.queryByRole('group', { name: 'Campus' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'BNE' })).not.toBeInTheDocument();
      expect(cardIds().sort()).toEqual([101, 102, 103]);
    });

    it('shows a no-campus-access state to a user with no campuses and nothing rostered', () => {
      renderLandingView({ runsheetCampuses: [], channels: [], canEdit: false });

      expect(screen.getByTestId('runsheet-no-access')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /no campus access/i })).toBeInTheDocument();
      expect(screen.queryByText(/no upcoming runsheets/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search by campus/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Campus' })).not.toBeInTheDocument();
    });

    it('treats a missing campus scope as no access', () => {
      renderLandingView({ runsheetCampuses: undefined, channels: [], canEdit: false });
      expect(screen.getByTestId('runsheet-no-access')).toBeInTheDocument();
    });

    it('shows skeletons, not the no-access state, while the list is loading', () => {
      renderLandingView({ runsheetCampuses: [], channels: [], isLoading: true });
      expect(screen.queryByTestId('runsheet-no-access')).not.toBeInTheDocument();
    });

    it('lists rostered runsheets for a user with no campuses instead of the no-access state', () => {
      renderLandingView({ runsheetCampuses: [], channels: [sampleChannels[1]], canEdit: false });

      expect(screen.queryByTestId('runsheet-no-access')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Campus' })).not.toBeInTheDocument();
      expect(cardIds()).toEqual([102]);
    });

    it('keeps a campus-scoped user with an empty list on the ordinary empty state', () => {
      renderLandingView({ runsheetCampuses: ['BNE'], channels: [] });
      expect(screen.queryByTestId('runsheet-no-access')).not.toBeInTheDocument();
      expect(screen.getByText(/no upcoming runsheets/i)).toBeInTheDocument();
    });
  });
});
