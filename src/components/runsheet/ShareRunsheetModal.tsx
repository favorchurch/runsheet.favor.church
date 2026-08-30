'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { HiClipboardDocument, HiClipboardDocumentCheck, HiXMark } from 'react-icons/hi2';

import { APP_URL } from '@/constants/client';

interface ShareRunsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareRunsheetModal({ isOpen, onClose }: ShareRunsheetModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Share the Runsheet App</h3>
            <p className="mt-1 text-xs text-slate-600">
              Scan to open the Favor Runsheet Platform on your phone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Image
            src="/img/runsheet-qr-code.png"
            alt="QR code linking to runsheet.favor.church"
            width={172}
            height={172}
            className="rounded"
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-800">
            {APP_URL}
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {copied ? (
              <>
                <HiClipboardDocumentCheck className="h-3.5 w-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <HiClipboardDocument className="h-3.5 w-3.5 text-slate-500" />
                <span>Copy link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
