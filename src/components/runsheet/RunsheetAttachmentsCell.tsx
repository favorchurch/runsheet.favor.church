'use client';

import { useMemo, useState } from 'react';
import { HiPaperClip, HiTrash } from 'react-icons/hi2';
import {
  parseAttachments,
  serializeAttachments,
  type RunsheetAttachment,
} from '@/lib/runsheetAttachments';
import { rockSetRunsheetItemAttachments } from '@/server-actions/rockSetRunsheetItemAttachments';
import PdfViewerModal from './PdfViewerModal';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileHref(channelId: number, key: string, download: boolean): string {
  const params = new URLSearchParams({ channelId: String(channelId), key });
  if (download) params.set('download', '1');
  return `/api/runsheet-attachments/file?${params.toString()}`;
}

/**
 * Preacher notes for one runsheet row.
 *
 * Every change persists to Rock the moment it happens — this cell never waits
 * for the grid's save button.
 */
export default function RunsheetAttachmentsCell({
  channelId,
  itemId,
  value,
  readOnly,
  onValueChange,
}: {
  channelId: number;
  itemId: number | string;
  value: string;
  readOnly: boolean;
  onValueChange: (next: string) => void;
}) {
  const attachments = useMemo(() => parseAttachments(value), [value]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<RunsheetAttachment | null>(null);

  const numericItemId = typeof itemId === 'number' ? itemId : Number.NaN;
  const savedRow = Number.isInteger(numericItemId);

  async function persist(next: RunsheetAttachment[]) {
    const result = await rockSetRunsheetItemAttachments({
      channelId,
      itemId: numericItemId,
      attachments: next,
    });
    if (!result.success) {
      setError(result.error || 'Could not save to Rock.');
      return false;
    }
    onValueChange(serializeAttachments(next));
    return true;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    let current = attachments;

    for (const file of Array.from(files)) {
      setBusy(file.name);
      const form = new FormData();
      form.append('file', file);
      form.append('channelId', String(channelId));
      form.append('itemId', String(numericItemId));

      try {
        const response = await fetch('/api/runsheet-attachments/upload', { method: 'POST', body: form });
        const body = await response.json();
        if (!response.ok) {
          setError(body?.error || `Could not upload ${file.name}.`);
          continue;
        }
        current = [...current, body as RunsheetAttachment];
        // Saved immediately, one file at a time: closing the tab now loses nothing.
        if (!(await persist(current))) return;
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        setBusy(null);
      }
    }
  }

  async function handleDelete(entry: RunsheetAttachment) {
    if (!window.confirm(`Remove "${entry.name}" from this runsheet?`)) return;
    setError(null);
    setBusy(entry.name);
    try {
      await fetch(fileHref(channelId, entry.key, false), { method: 'DELETE' });
      await persist(attachments.filter((item) => item.key !== entry.key));
    } finally {
      setBusy(null);
    }
  }

  if (readOnly) return <span className="block px-1 text-xs text-slate-400">&mdash;</span>;

  return (
    <div className="px-1 py-0.5 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        title={attachments.length ? `${attachments.length} attached` : 'Attach preacher notes'}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
          attachments.length ? 'text-blue-700 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-100'
        }`}
      >
        <HiPaperClip className="h-3.5 w-3.5" />
        {attachments.length > 0 && <span className="font-semibold">{attachments.length}</span>}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 rounded border border-slate-200 bg-white p-1.5 text-left">
          {!savedRow && <p className="text-[11px] text-amber-700">Save this row before attaching files.</p>}

          {attachments.map((entry) => (
            <div key={entry.key} className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewing(entry)}
                className="truncate text-left text-blue-700 hover:underline"
              >
                {entry.name}
              </button>
              <span className="shrink-0 text-[11px] text-slate-400">{formatSize(entry.size)}</span>
              <button
                type="button"
                onClick={() => handleDelete(entry)}
                aria-label={`Delete ${entry.name}`}
                className="shrink-0 text-rose-600 hover:text-rose-700"
              >
                <HiTrash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {savedRow && (
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
              className="block w-full text-[11px]"
            />
          )}

          {busy && <p className="text-[11px] text-slate-500">Uploading {busy}…</p>}
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
      )}

      <PdfViewerModal
        open={Boolean(viewing)}
        title={viewing?.name || ''}
        src={viewing ? fileHref(channelId, viewing.key, false) : ''}
        downloadSrc={viewing ? fileHref(channelId, viewing.key, true) : ''}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
