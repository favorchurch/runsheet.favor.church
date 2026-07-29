'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { htmlToPlainText, legacyValueToHtml } from '@/lib/richText';
import { sanitizeRichText } from '@/lib/sanitizeRichText';

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

  const html = useMemo(() => (value ? legacyValueToHtml(value) : ''), [value]);
  const sanitized = useMemo(() => (isMounted ? sanitizeRichText(html) : null), [html, isMounted]);

  if (!value) return null;

  if (sanitized === null) {
    return <div className={`whitespace-pre-wrap break-words ${className ?? ''}`}>{htmlToPlainText(value)}</div>;
  }

  return (
    <div
      className={`runsheet-rich-text break-words ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
