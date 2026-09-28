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
jest.mock('@/lib/permissions', () => ({
  canUserEditRunsheet: jest.fn(),
  hasFullEditorRole: jest.fn().mockReturnValue(true),
}));
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
const mockSave = jest.fn(async () => true);

jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({
  RunsheetTableEditor: ({
    readOnly,
    canEdit,
    editorMode,
    onModeChange,
    onDirtyChange,
    onSaveRef,
  }: {
    readOnly?: boolean;
    canEdit?: boolean;
    editorMode?: 'view' | 'edit';
    onModeChange?: (mode: 'view' | 'edit') => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaveRef?: (fn: () => Promise<boolean>) => void;
  }) => (
    <div data-testid="runsheet-editor" data-readonly={String(Boolean(readOnly))}>
      <button type="button" aria-label="Simulate edit" onClick={() => {
        onSaveRef?.(mockSave as () => Promise<boolean>);
        onDirtyChange?.(true);
      }}>
        Simulate edit
      </button>
      {canEdit && (
        <div role="group" aria-label="Runsheet mode">
          <button
            type="button"
            aria-label="View mode"
            title="View mode"
            aria-pressed={editorMode === 'view'}
            onClick={() => onModeChange?.('view')}
          >
            View
          </button>
          <button
            type="button"
            aria-label="Edit mode"
            title="Edit mode"
            aria-pressed={editorMode === 'edit'}
            onClick={() => onModeChange?.('edit')}
          >
            Edit
          </button>
        </div>
      )}
    </div>
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

describe('RunsheetManager unsaved work and view mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockClear();
    mockSave.mockResolvedValue(true);
    mockCanUserEditRunsheet.mockImplementation((user) => Boolean(user?.rolesMap?.editor?.length));
    mockRunsheetReads();
    mockGetRockSession.mockResolvedValue(viewerUser);
    mockRockGet.mockResolvedValue([]);
    mockRockPost.mockResolvedValue(123);
    mockRockPatch.mockResolvedValue(null);
    mockRockDelete.mockResolvedValue(null);
  });

  async function openInEditModeWithChanges() {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /edit mode/i }));
    await waitFor(() =>
      expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'false'),
    );
    fireEvent.click(screen.getByRole('button', { name: /simulate edit/i }));
  }

  it('asks before dropping unsaved work by switching to View mode', async () => {
    await openInEditModeWithChanges();

    fireEvent.click(screen.getByRole('button', { name: /view mode/i }));

    // Must not have switched yet — view mode is read-only, so switching first
    // would strand the edits with no way to save them.
    await screen.findByRole('heading', { name: /unsaved changes/i });
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'false');
  });

  it('offers a working Save while still in Edit mode', async () => {
    await openInEditModeWithChanges();
    fireEvent.click(screen.getByRole('button', { name: /view mode/i }));
    await screen.findByRole('heading', { name: /unsaved changes/i });

    const save = screen.getByRole('button', { name: /save & switch/i });
    fireEvent.click(save);

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true'),
    );
  });

  it('never prompts when navigating away in View mode', async () => {
    renderManager(<RunsheetManager user={editorUser} initialChannelId={1} />);
    await waitFor(() => expect(screen.getByTestId('runsheet-editor')).toBeInTheDocument());

    // Nothing is editable in view mode, so a prompt there can only offer to
    // discard changes the user never made.
    expect(screen.getByTestId('runsheet-editor')).toHaveAttribute('data-readonly', 'true');
    fireEvent.click(screen.getByTitle('Back to home'));

    await waitFor(() => expect(screen.queryByRole('heading', { name: /unsaved changes/i })).not.toBeInTheDocument());
  });
});
