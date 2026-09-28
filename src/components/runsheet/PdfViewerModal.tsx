'use client';

import { HiArrowDownTray, HiXMark } from 'react-icons/hi2';

/**
 * Renders one attachment inline. `src` and `downloadSrc` both point at the
 * app's own proxy route, never at the raw Rock asset URL.
 */
export default function PdfViewerModal({
  open,
  title,
  src,
  downloadSrc,
  onClose,
}: {
  open: boolean;
  title: string;
  src: string;
  downloadSrc: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">
            <a
              href={downloadSrc}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <HiArrowDownTray className="h-3.5 w-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
            >
              <HiXMark className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-slate-100">
          {/* Browsers that cannot render a PDF inline show the fallback text
              behind the frame, so the Download button stays the way out. */}
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
            This browser cannot display the PDF inline. Use Download to open it.
          </p>
          <iframe title={title} src={src} className="relative h-full w-full border-0" />
        </div>
      </div>
    </div>
  );
}
