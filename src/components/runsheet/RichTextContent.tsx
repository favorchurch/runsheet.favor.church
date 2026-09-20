'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { extractCellUrl, htmlToPlainText, legacyValueToHtml } from '@/lib/richText';
import { sanitizeRichText } from '@/lib/sanitizeRichText';
import { HiArrowTopRightOnSquare, HiLink } from 'react-icons/hi2';

/**
 * A layout effect in the browser, a plain effect on the server.
 *
 * The upgrade from plain text to sanitised HTML has to land before paint, or a
 * cell visibly flashes its unformatted text each time it leaves edit mode.
 * `useLayoutEffect` alone would warn during server rendering.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface RichTextContentProps {
  value: string;
  className?: string;
}

function formatDisplayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathname = parsed.pathname !== '/' ? parsed.pathname : '';
    const full = `${host}${pathname}`;
    return full.length > 28 ? `${full.slice(0, 25)}…` : full;
  } catch {
    const trimmed = rawUrl.replace(/^https?:\/\/(www\.)?/, '');
    return trimmed.length > 28 ? `${trimmed.slice(0, 25)}…` : trimmed;
  }
}

/**
 * Read-only renderer for a runsheet cell.
 *
 * Only the cell being edited mounts a Tiptap editor; every other cell renders
 * here, which keeps a full runsheet to one editor instance instead of hundreds.
 *
 * Markup is injected only after mount, once DOMPurify has a DOM to sanitise
 * against. The server render (and the matching first client render) shows plain
 * text, so hydration stays consistent and unsanitised HTML is never injected.
 */
export function RichTextContent({ value, className }: RichTextContentProps) {
  const [isMounted, setIsMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  const { contentHtml, url } = useMemo(() => extractCellUrl(value), [value]);

  const html = useMemo(() => (contentHtml ? legacyValueToHtml(contentHtml) : ''), [contentHtml]);
  const sanitized = useMemo(() => (isMounted ? sanitizeRichText(html) : null), [html, isMounted]);

  if (!value) return null;

  const renderUrlChip = () => {
    if (!url) return null;
    const formatted = formatDisplayUrl(url);
    const href = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') ? url : `https://${url}`;

    return (
      <div className="mt-1 flex items-center">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/90 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 hover:text-blue-900 transition-colors shadow-2xs cursor-pointer max-w-full truncate"
          title={url}
          aria-label={`Open reference: ${url}`}
        >
          <HiLink className="h-2.5 w-2.5 shrink-0 text-blue-500" aria-hidden="true" />
          <span className="truncate max-w-[160px]">{formatted}</span>
          <HiArrowTopRightOnSquare className="h-2.5 w-2.5 shrink-0 text-blue-400" aria-hidden="true" />
        </a>
      </div>
    );
  };

  if (sanitized === null) {
    return (
      <div className={className ?? ''}>
        {contentHtml ? (
          <div className="whitespace-pre-wrap break-words">{htmlToPlainText(contentHtml)}</div>
        ) : null}
        {renderUrlChip()}
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      {contentHtml ? (
        <div
          className="runsheet-rich-text break-words"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      ) : null}
      {renderUrlChip()}
    </div>
  );
}
