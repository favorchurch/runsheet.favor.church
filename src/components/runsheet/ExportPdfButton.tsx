'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { HiPrinter } from 'react-icons/hi2';

/** Delay before revoking, so iOS Safari has started the download first. */
const REVOKE_DELAY_MS = 1000;

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  let name: string | undefined;
  if (encoded) {
    try {
      name = decodeURIComponent(encoded.trim());
    } catch {
      name = undefined;
    }
  }
  name ??= header?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]?.trim();
  // Keep only the last path segment; the server's name must not steer where the browser saves.
  const safe = name?.split(/[\\/]/).pop()?.trim();
  return safe || fallback;
}

function errorMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return "You don't have permission to export this runsheet.";
  if (status === 404) return 'This runsheet could not be found for export.';
  return 'Failed to export the runsheet PDF. Please try again.';
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

interface ExportPdfButtonProps {
  channelId: number;
  /** Service name/time shown in the label so the export scope is explicit. */
  channelName: string;
  /** True when the editor holds edits that the server-side export cannot see. */
  hasUnsavedChanges: boolean;
}

export function ExportPdfButton({ channelId, channelName, hasUnsavedChanges }: ExportPdfButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const text = isExporting ? 'Exporting…' : 'Export PDF';
  // Starts with the visible text so the accessible name always contains it.
  const label = `${text} – ${channelName}`;

  const handleClick = async () => {
    setIsExporting(true);
    if (hasUnsavedChanges) {
      toast('You have unsaved changes. The PDF reflects the last saved version.', { icon: '⚠️' });
    }
    try {
      const response = await fetch(`/api/runsheet-export/${channelId}`, { credentials: 'same-origin' });
      if (!response.ok) {
        toast.error(errorMessage(response.status));
        return;
      }
      const blob = await response.blob();
      if (!blob.type.includes('pdf')) {
        toast.error('The server did not return a PDF. Please try again.');
        return;
      }
      saveBlob(
        blob,
        filenameFromContentDisposition(response.headers.get('Content-Disposition'), `runsheet-${channelId}.pdf`),
      );
    } catch {
      toast.error('Network error while exporting the runsheet PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isExporting}
      aria-busy={isExporting}
      aria-label={label}
      title={label}
      className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
    >
      <HiPrinter className={`h-3.5 w-3.5 text-blue-600 ${isExporting ? 'animate-pulse' : ''}`} />
      <span>{text}</span>
    </button>
  );
}
