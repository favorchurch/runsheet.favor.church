/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { canUserEditRunsheet } from '@/lib/permissions';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockDelete, rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/permissions', () => ({ canUserEditRunsheet: jest.fn() }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetails');
jest.mock('@/components/runsheet/CreateRunsheetForm', () => ({ CreateRunsheetForm: () => null }));
jest.mock('@/components/runsheet/RunsheetCompareView', () => ({
  RunsheetCompareView: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="compare-view" data-readonly={String(Boolean(readOnly))} />
  ),
}));
jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({
  RunsheetTableEditor: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="runsheet-editor" data-readonly={String(Boolean(readOnly))} />
  ),
}));

const mockCanUserEditRunsheet = jest.mocked(canUserEditRunsheet);
const mockGetRockSession = jest.mocked(getRockSession);
const mockRockDelete = jest.mocked(rockDelete);
const mockRockGet = jest.mocked(rockGet);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockPost = jest.mocked(rockPost);
const mockGetAvailableRunsheetChannels = jest.mocked(rockGetAvailableRunsheetChannels);
const mockGetRunsheetDetails = jest.mocked(rockGetRunsheetDetails);

const editorUser = {
  rolesMap: { editor: ['editor-1'], viewer: ['editor-1'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

const viewerUser = {
  rolesMap: { viewer: ['viewer-1'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

function renderManager(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) =>
      result.rerender(<QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>),
  };
}

function mockRunsheetReads() {
  mockGetAvailableRunsheetChannels.mockResolvedValue({
    success: true,
    channels: [
      { id: 1, name: 'MNL Service // August 17, 2026 // 10AM', time: '10AM' },
      { id: 2, name: 'MNL Service // August 17, 2026 // 11AM', time: '11AM' },
    ],
  });
  mockGetRunsheetDetails.mockImplementation(async (channelId) => ({
    success: true,
    data: {
      channelId,
      name: `MNL Service // August 17, 2026 // ${channelId === 1 ? '10AM' : '11AM'}`,
      subtitle: '',
      startTime: '',
      contentChannelTypeId: 13,
      columns: [],
      items: [],
    },
  }));
}

describe('RunsheetManager View/Edit toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUserEditRunsheet.mockImplementation((user) => Boolean(user?.rolesMap?.editor?.length));
    mockRunsheetReads();
    mockGetRockSession.mockResolvedValue(viewerUser);
    mockRockGet.mockResolvedValue([]);
    mockRockPost.mockResolvedValue(123);
    mockRockPatch.mockResolvedValue(null);
    mockRockDelete.mockResolvedValue(null);
  });

  it('defaults editors to View mode', () => {
    renderManager(<RunsheetManager user={editorUser} />);

    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /edit mode/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets an editor opt into Edit mode and return to View mode', async () => {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));

    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByRole('button', { name: /edit mode/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /view mode/i }));
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets to View mode when an editor loads another channel', async () => {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));

    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));
    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets to View mode when an editor opens Create', async () => {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));

    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));

    fireEvent.click(screen.getByRole('button', { name: /create new runsheet/i }));
    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not render the toggle for viewers', async () => {
    renderManager(<RunsheetManager user={viewerUser} initialChannelId={1} />);

    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));
    expect(screen.queryByRole('group', { name: 'Runsheet mode' })).not.toBeInTheDocument();
  });

  it('re-checks edit permission before unlocking when a principal changes to viewer', async () => {
    let editAllowed = true;
    mockCanUserEditRunsheet.mockImplementation(() => editAllowed);

    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));

    editAllowed = false;
    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));

    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true');
    expect(mockCanUserEditRunsheet).toHaveBeenCalledWith(editorUser);
    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('locks a mounted editor and hides the toggle when its user prop loses edit access', async () => {
    const { rerender } = renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));

    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'false');

    rerender(<RunsheetManager user={viewerUser} initialChannelId={1} />);

    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'));
    expect(screen.queryByRole('group', { name: 'Runsheet mode' })).not.toBeInTheDocument();

    rerender(<RunsheetManager user={editorUser} initialChannelId={1} />);
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByRole('button', { name: /view mode/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('passes View mode through to the compare view as readOnly', async () => {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /compare/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    expect(screen.getByTestId('compare-view')).toHaveAttribute('data-readonly', 'true');
  });

  it('keeps a viewer server-denied even if the client tries to force Edit mode', async () => {
    mockGetRockSession.mockResolvedValue(viewerUser);
    mockRockGet.mockImplementation(async (url) =>
      url.startsWith('/ContentChannels/')
        ? { Name: 'MNL Service // August 17, 2026 // 10AM', ContentChannelTypeId: 13, ItemsManuallyOrdered: true }
        : [],
    );

    const result = await rockBulkSaveRunsheetItems(42, [], []);

    expect(result.success).toBe(false);
    expect(mockRockPost).not.toHaveBeenCalled();
    expect(mockRockPatch).not.toHaveBeenCalled();
    expect(mockRockDelete).not.toHaveBeenCalled();
  });
});
