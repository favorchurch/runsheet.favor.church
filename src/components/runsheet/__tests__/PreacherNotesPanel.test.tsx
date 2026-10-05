/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  formatFileSize,
  formatUploadDate,
  PreacherNotesPanel,
} from '@/components/runsheet/PreacherNotesPanel';
import {
  rockGetPreacherNotes,
  rockUnlinkPreacherNote,
} from '@/server-actions/rockPreacherNotes';
import type { PreacherNote } from '@/types/PreacherNotes';

jest.mock('@/server-actions/rockPreacherNotes', () => ({
  rockGetPreacherNotes: jest.fn(),
  rockUnlinkPreacherNote: jest.fn(),
}));

const mockGetNotes = jest.mocked(rockGetPreacherNotes);
const mockUnlinkNote = jest.mocked(rockUnlinkPreacherNote);

describe('PreacherNotesPanel helpers', () => {
  it('formats file sizes accurately into human-readable strings', () => {
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(Math.floor(4.4 * 1024 * 1024))).toBe('4.4 MB');
  });

  it('formats ISO upload dates', () => {
    expect(formatUploadDate(undefined)).toBe('');
    expect(formatUploadDate('invalid-date')).toBe('');
    const formatted = formatUploadDate('2026-10-06T10:00:00Z');
    expect(formatted).toMatch(/Oct 6, 2026/);
  });
});

describe('PreacherNotesPanel', () => {
  const channelId = 42;
  const sampleNote: PreacherNote = {
    name: 'Sermon Notes.pdf',
    path: 'PreacherNotes/MNL/42/deadbeef/sermon-notes.pdf',
    size: 512 * 1024, // 512 KB
    uploadedAt: '2026-10-06T12:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('renders empty state when there are no preacher notes', async () => {
    mockGetNotes.mockResolvedValueOnce({ success: true, notes: [] });

    render(<PreacherNotesPanel channelId={channelId} />);

    expect(screen.getByText(/loading preacher notes/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no preacher notes attached yet/i)).toBeInTheDocument();
    });

    expect(mockGetNotes).toHaveBeenCalledWith(channelId);
    expect(screen.getByLabelText(/attach pdf/i)).toBeInTheDocument();
  });

  it('renders a list of notes with name, human size, upload date, and Open/Download actions', async () => {
    mockGetNotes.mockResolvedValueOnce({
      success: true,
      notes: [sampleNote],
    });

    render(<PreacherNotesPanel channelId={channelId} />);

    await waitFor(() => {
      expect(screen.getByText('Sermon Notes.pdf')).toBeInTheDocument();
    });

    // Human size & upload date
    expect(screen.getByText('512 KB')).toBeInTheDocument();
    expect(screen.getByText(/uploaded oct 6, 2026/i)).toBeInTheDocument();

    // Count badge
    expect(screen.getByTestId('preacher-notes-count')).toHaveTextContent('1');

    // Open link (opens in new tab to inline route)
    const openLink = screen.getByRole('link', { name: /open sermon notes\.pdf in new tab/i });
    expect(openLink).toBeInTheDocument();
    expect(openLink).toHaveAttribute('target', '_blank');
    expect(openLink).toHaveAttribute(
      'href',
      `/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(sampleNote.path)}`,
    );

    // Download link (includes download=1)
    const downloadLink = screen.getByRole('link', { name: /download sermon notes\.pdf/i });
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute(
      'href',
      `/api/runsheet-notes/file?channelId=42&path=${encodeURIComponent(sampleNote.path)}&download=1`,
    );
    expect(downloadLink).toHaveAttribute('download', sampleNote.name);
  });

  it('rejects a non-PDF file on the client without uploading', async () => {
    mockGetNotes.mockResolvedValueOnce({ success: true, notes: [] });

    render(<PreacherNotesPanel channelId={channelId} />);

    await waitFor(() => {
      expect(screen.getByText(/no preacher notes attached yet/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/attach pdf/i);
    const textFile = new File(['text content'], 'outline.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [textFile] } });

    await waitFor(() => {
      expect(screen.getByText('outline.txt')).toBeInTheDocument();
      expect(screen.getByText('(Only PDF files are allowed.)')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversize file (>4.4 MB) on the client without uploading', async () => {
    mockGetNotes.mockResolvedValueOnce({ success: true, notes: [] });

    render(<PreacherNotesPanel channelId={channelId} />);

    await waitFor(() => {
      expect(screen.getByText(/no preacher notes attached yet/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/attach pdf/i);
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024); // 5 MB
    const largeFile = new File([oversizedBytes], 'large-slides.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText('large-slides.pdf')).toBeInTheDocument();
      expect(
        screen.getByText('(File size exceeds maximum allowed size (4.4 MB).)'),
      ).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uploads a valid PDF file sequentially and appends it to the list', async () => {
    mockGetNotes.mockResolvedValueOnce({ success: true, notes: [sampleNote] });

    const newNote: PreacherNote = {
      name: 'Second Sermon.pdf',
      path: 'PreacherNotes/MNL/42/cafebabe/second-sermon.pdf',
      size: 1024 * 1024,
      uploadedAt: '2026-10-06T14:00:00.000Z',
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        notes: [sampleNote, newNote],
      }),
    });

    render(<PreacherNotesPanel channelId={channelId} />);

    await waitFor(() => {
      expect(screen.getByText('Sermon Notes.pdf')).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/attach pdf/i);
    const validFile = new File(['%PDF-1.4 mock content'], 'Second Sermon.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/runsheet-notes/upload?channelId=${channelId}`,
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    // Check FormData passed to fetch
    const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
    const formData = fetchArgs[1].body as FormData;
    expect(formData.get('file')).toBeDefined();

    // Verifies appended item appears in the list
    await waitFor(() => {
      expect(screen.getByText('Second Sermon.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('1 MB')).toBeInTheDocument();
  });

  it('removes note only after confirming, with confirmation text explaining file stays in Rock Asset Manager', async () => {
    mockGetNotes.mockResolvedValueOnce({ success: true, notes: [sampleNote] });
    mockUnlinkNote.mockResolvedValueOnce({ success: true, notes: [] });

    render(<PreacherNotesPanel channelId={channelId} />);

    await waitFor(() => {
      expect(screen.getByText('Sermon Notes.pdf')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /remove sermon notes\.pdf/i });
    fireEvent.click(removeBtn);

    // Confirmation step text check
    expect(
      screen.getByText(/Remove this note\? The file stays in Rock's Asset Manager\./i),
    ).toBeInTheDocument();

    // Confirm button
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockUnlinkNote).toHaveBeenCalledWith(channelId, sampleNote.path);
    });

    // Note removed, empty state shown
    await waitFor(() => {
      expect(screen.queryByText('Sermon Notes.pdf')).not.toBeInTheDocument();
      expect(screen.getByText(/no preacher notes attached yet/i)).toBeInTheDocument();
    });
  });
});
