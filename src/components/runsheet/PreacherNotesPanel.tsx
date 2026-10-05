'use client';

import React, { useEffect, useState } from 'react';
import {
  HiArrowDownTray,
  HiArrowTopRightOnSquare,
  HiDocumentText,
  HiExclamationCircle,
  HiPaperClip,
  HiTrash,
  HiXMark,
} from 'react-icons/hi2';
import { PREACHER_NOTES_MAX_BYTES } from '@/lib/preacherNotes';
import {
  rockGetPreacherNotes,
  rockUnlinkPreacherNote,
} from '@/server-actions/rockPreacherNotes';
import type { PreacherNote } from '@/types/PreacherNotes';

export interface PreacherNotesPanelProps {
  channelId: number;
}

interface PendingUpload {
  id: string;
  name: string;
  status: 'uploading' | 'error';
  error?: string;
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb * 10) / 10} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb * 10) / 10} MB`;
}

export function formatUploadDate(isoDate?: string): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function PreacherNotesPanel({ channelId }: PreacherNotesPanelProps) {
  const [notes, setNotes] = useState<PreacherNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    rockGetPreacherNotes(channelId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.notes) {
          setNotes(res.notes);
        } else if (!res.success) {
          setError(res.error || 'Failed to load preacher notes.');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setError('Failed to load preacher notes.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    for (const file of files) {
      const uploadId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Client-side pre-check: PDF type
      const isPdfType =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdfType) {
        setPendingUploads((prev) => [
          ...prev,
          {
            id: uploadId,
            name: file.name,
            status: 'error',
            error: 'Only PDF files are allowed.',
          },
        ]);
        continue;
      }

      // Client-side pre-check: 4.4 MB cap
      if (file.size > PREACHER_NOTES_MAX_BYTES) {
        setPendingUploads((prev) => [
          ...prev,
          {
            id: uploadId,
            name: file.name,
            status: 'error',
            error: 'File size exceeds maximum allowed size (4.4 MB).',
          },
        ]);
        continue;
      }

      // Upload one at a time
      setPendingUploads((prev) => [
        ...prev,
        {
          id: uploadId,
          name: file.name,
          status: 'uploading',
        },
      ]);

      try {
        const formData = new FormData();
        const fileToUpload =
          file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf'
            ? new File([file], file.name, { type: 'application/pdf' })
            : file;
        formData.append('file', fileToUpload);

        const res = await fetch(`/api/runsheet-notes/upload?channelId=${channelId}`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          const errorMsg = data?.error || 'Failed to upload note.';
          setPendingUploads((prev) =>
            prev.map((item) =>
              item.id === uploadId ? { ...item, status: 'error', error: errorMsg } : item,
            ),
          );
        } else {
          if (Array.isArray(data.notes)) {
            setNotes(data.notes);
          } else {
            const refreshed = await rockGetPreacherNotes(channelId);
            if (refreshed.success && refreshed.notes) {
              setNotes(refreshed.notes);
            }
          }
          setPendingUploads((prev) => prev.filter((item) => item.id !== uploadId));
        }
      } catch {
        setPendingUploads((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, status: 'error', error: 'An unexpected error occurred during upload.' }
              : item,
          ),
        );
      }
    }
  };

  const handleRemove = async (path: string) => {
    setIsRemoving(true);
    try {
      const res = await rockUnlinkPreacherNote(channelId, path);
      if (res.success) {
        if (Array.isArray(res.notes)) {
          setNotes(res.notes);
        } else {
          setNotes((prev) => prev.filter((n) => n.path !== path));
        }
        setConfirmRemovePath(null);
      } else {
        setError(res.error || 'Failed to remove note.');
      }
    } catch {
      setError('Failed to remove note.');
    } finally {
      setIsRemoving(false);
    }
  };

  const dismissPendingUpload = (id: string) => {
    setPendingUploads((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div
      data-testid="preacher-notes-panel"
      className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:p-4 mb-3 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <HiDocumentText className="h-4 w-4 text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Preacher Notes
          </h3>
          {notes.length > 0 && (
            <span
              data-testid="preacher-notes-count"
              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {notes.length}
            </span>
          )}
        </div>

        <label
          className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shrink-0"
          role="button"
          tabIndex={0}
        >
          <HiPaperClip className="h-4 w-4" />
          <span>Attach PDF</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={handleFileSelect}
            aria-label="Attach PDF"
          />
        </label>
      </div>

      {error && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">
          <div className="flex items-center gap-2">
            <HiExclamationCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-rose-500 hover:text-rose-700"
            aria-label="Dismiss error"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-xs text-slate-500">Loading preacher notes...</div>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2">
          {notes.length === 0 && pendingUploads.length === 0 && (
            <div className="py-3 text-center text-xs text-slate-500">
              No preacher notes attached yet.
            </div>
          )}

          {notes.map((note) => {
            const isConfirming = confirmRemovePath === note.path;
            const inlineUrl = `/api/runsheet-notes/file?channelId=${channelId}&path=${encodeURIComponent(note.path)}`;
            const downloadUrl = `/api/runsheet-notes/file?channelId=${channelId}&path=${encodeURIComponent(note.path)}&download=1`;
            const sizeStr = formatFileSize(note.size);
            const dateStr = formatUploadDate(note.uploadedAt);

            return (
              <div
                key={note.path}
                data-testid={`preacher-note-item-${note.path}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <HiDocumentText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span
                      title={note.name}
                      className="font-medium text-xs sm:text-sm text-slate-900 truncate"
                    >
                      {note.name}
                    </span>
                  </div>
                  {(sizeStr || dateStr) && (
                    <div className="mt-0.5 ml-6 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                      {sizeStr && <span>{sizeStr}</span>}
                      {sizeStr && dateStr && <span>•</span>}
                      {dateStr && <span>Uploaded {dateStr}</span>}
                    </div>
                  )}
                </div>

                {isConfirming ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2 sm:border-t-0 sm:pt-0">
                    <span className="text-xs text-slate-600 font-medium">
                      Remove this note? The file stays in Rock&apos;s Asset Manager.
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRemove(note.path)}
                        disabled={isRemoving}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                      >
                        {isRemoving ? 'Removing...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemovePath(null)}
                        disabled={isRemoving}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                    <a
                      href={inlineUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                      aria-label={`Open ${note.name} in new tab`}
                    >
                      <HiArrowTopRightOnSquare className="h-3.5 w-3.5 text-slate-500" />
                      <span>Open</span>
                    </a>
                    <a
                      href={downloadUrl}
                      download={note.name}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                      aria-label={`Download ${note.name}`}
                    >
                      <HiArrowDownTray className="h-3.5 w-3.5 text-slate-500" />
                      <span>Download</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmRemovePath(note.path)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors shadow-2xs"
                      aria-label={`Remove ${note.name}`}
                    >
                      <HiTrash className="h-3.5 w-3.5 text-rose-500" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {pendingUploads.map((pending) => (
            <div
              key={pending.id}
              data-testid={`pending-upload-${pending.id}`}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-2.5 text-xs ${
                pending.status === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {pending.status === 'uploading' ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600 shrink-0"
                  />
                ) : (
                  <HiExclamationCircle className="h-4 w-4 text-rose-500 shrink-0" />
                )}
                <span className="font-medium truncate">{pending.name}</span>
                {pending.status === 'uploading' && (
                  <span className="text-slate-500">Uploading...</span>
                )}
                {pending.status === 'error' && (
                  <span className="text-rose-600 font-medium">({pending.error})</span>
                )}
              </div>

              {pending.status === 'error' && (
                <button
                  type="button"
                  onClick={() => dismissPendingUpload(pending.id)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center self-end sm:self-auto rounded-lg px-2 text-rose-500 hover:text-rose-700"
                  aria-label="Dismiss error"
                >
                  <HiXMark className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
