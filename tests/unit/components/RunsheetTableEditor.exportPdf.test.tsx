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
jest.mock('react-hot-toast', () => {
  const toast: any = jest.fn();
  toast.error = jest.fn();
  toast.success = jest.fn();
  toast.loading = jest.fn();
  return { __esModule: true, default: toast };
});
jest.mock('@/components/runsheet/runsheetQueries', () => ({
  ...jest.requireActual('@/components/runsheet/runsheetQueries'),
  useRosterAssignments: () => ({ data: undefined }),
}));
jest.mock('@/lib/richText', () => ({
  htmlToPlainText: (s: string) => s,
  legacyValueToHtml: (s: string) => s,
  sanitizeRichText: (s: string) => s,
  extractCellUrl: (s: string) => ({ contentHtml: s, url: null }),
  embedCellUrl: (contentHtml: string, url: string | null) => (url ? `${contentHtml}${url}` : contentHtml),
  isRichTextEmpty: (s: string) => !s,
  normalizeRichTextValue: (s: string) => s || '',
  RICH_TEXT_ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'span', 'br', 'ul', 'ol', 'li', 'a'],
  RICH_TEXT_ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'rel', 'data-cell-url'],
}));

import '@testing-library/jest-dom';
import React from 'react';
import toast from 'react-hot-toast';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { filenameFromContentDisposition } from '@/components/runsheet/ExportPdfButton';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

const columns: DynamicAttributeColumn[] = [{ id: 1, key: 'ACTIVITYTITLE', name: 'Activity' }];
const initialItems: RunsheetItemRow[] = [
  { id: 101, title: 'Welcome', order: 1, startDateTime: '2026-08-16T10:00:00.000Z', duration: 5, attributeValues: { ACTIVITYTITLE: 'Welcome' } },
];

function renderEditor(props: Partial<React.ComponentProps<typeof RunsheetTableEditor>> = {}) {
  return render(
    <RunsheetTableEditor
      channelId={42}
      channelName="MNL Crowne // Aug 16, 2026 // 9AM"
      columns={columns}
      initialItems={initialItems}
      initialStartTime="10:00:00 AM"
      {...props}
    />,
  );
}

function pdfResponse(filename = 'Favor Runsheet 9AM.pdf') {
  const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-disposition' ? `attachment; filename="${filename}"` : null) },
    blob: jest.fn().mockResolvedValue(blob),
  };
}

const exportButton = () => screen.getByRole('button', { name: /^Export PDF –/ });

describe('RunsheetTableEditor Export PDF button', () => {
  let fetchMock: jest.Mock;
  let clickSpy: jest.SpyInstance;
  let clickedDownloads: Array<{ download: string; href: string }>;

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
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();
    clickedDownloads = [];
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownloads.push({ download: this.download, href: this.href });
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    jest.useRealTimers();
  });

  test('renders in view mode and edit mode, naming the service in label and tooltip', () => {
    const { unmount } = renderEditor({ readOnly: true });
    expect(exportButton()).toHaveAttribute('title', 'Export PDF – MNL Crowne // Aug 16, 2026 // 9AM');
    unmount();
    renderEditor({ readOnly: false });
    expect(exportButton()).toBeInTheDocument();
  });

  test('is visible to a viewer who cannot edit', () => {
    renderEditor({ readOnly: true, canEdit: false });
    expect(exportButton()).toBeInTheDocument();
  });

  test('fetches the endpoint for the selected channel and downloads with the server filename', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(pdfResponse());
    renderEditor({ readOnly: true });

    await act(async () => {
      fireEvent.click(exportButton());
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/runsheet-export/42');
    expect(clickedDownloads).toEqual([{ download: 'Favor Runsheet 9AM.pdf', href: 'blob:mock-url' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();

    // Revoked after the click, not before: iOS Safari needs the URL alive while the download starts.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  test('shows a loading state and ignores a second click while exporting', async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolveFetch = r)));
    renderEditor({ readOnly: true });

    fireEvent.click(exportButton());
    await waitFor(() => expect(exportButton()).toBeDisabled());
    expect(exportButton()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Exporting…')).toBeInTheDocument();
    fireEvent.click(exportButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(pdfResponse());
    });
    await waitFor(() => expect(exportButton()).not.toBeDisabled());
  });

  test.each([
    [403, /permission/i],
    [404, /could not be found/i],
    [500, /failed to export/i],
  ])('shows an error toast and does not download on HTTP %i', async (status, message) => {
    fetchMock.mockResolvedValue({ ok: false, status, headers: { get: () => null }, blob: jest.fn() });
    renderEditor({ readOnly: true });

    await act(async () => {
      fireEvent.click(exportButton());
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(message));
    expect(clickedDownloads).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(exportButton()).not.toBeDisabled();
  });

  test('shows an error toast on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderEditor({ readOnly: true });

    await act(async () => {
      fireEvent.click(exportButton());
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/network error/i));
    expect(clickedDownloads).toEqual([]);
  });

  test('warns that the export reflects the last saved version when edit mode has unsaved changes, then still downloads', async () => {
    fetchMock.mockResolvedValue(pdfResponse());
    renderEditor({ readOnly: false });

    await act(async () => {
      fireEvent.click(exportButton());
    });
    expect(toast).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '09:30:00 AM' } });
    await act(async () => {
      fireEvent.click(exportButton());
    });

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/last saved version/i), expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clickedDownloads).toHaveLength(2);
  });
});

describe('filenameFromContentDisposition', () => {
  test('reads quoted, bare and RFC 5987 filenames', () => {
    expect(filenameFromContentDisposition('attachment; filename="a b.pdf"', 'f.pdf')).toBe('a b.pdf');
    expect(filenameFromContentDisposition('attachment; filename=a.pdf', 'f.pdf')).toBe('a.pdf');
    expect(filenameFromContentDisposition("attachment; filename=\"x.pdf\"; filename*=UTF-8''Caf%C3%A9.pdf", 'f.pdf')).toBe('Café.pdf');
  });

  test('falls back when the header is missing and strips path segments', () => {
    expect(filenameFromContentDisposition(null, 'f.pdf')).toBe('f.pdf');
    expect(filenameFromContentDisposition('attachment', 'f.pdf')).toBe('f.pdf');
    expect(filenameFromContentDisposition('attachment; filename="../../evil.pdf"', 'f.pdf')).toBe('evil.pdf');
  });
});
