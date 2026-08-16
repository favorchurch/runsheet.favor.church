'use client';

import DOMPurify from 'dompurify';
import { RICH_TEXT_ALLOWED_ATTR, RICH_TEXT_ALLOWED_TAGS } from '@/lib/richText';

/**
 * Sanitises stored runsheet HTML before it is injected into the page.
 *
 * Cell values come back from Rock, where other tools and users can write to the
 * same attributes, so they are treated as untrusted. DOMPurify needs a real DOM;
 * outside the browser this returns `null` and callers fall back to plain text
 * instead of injecting markup (see `RichTextContent`). Returning `null` rather
 * than the input string matters: DOMPurify is a no-op without a `window`, so
 * passing its output straight through on the server would skip sanitisation.
 */
export function sanitizeRichText(html: string): string | null {
  if (!html) return '';
  if (typeof window === 'undefined') return null;

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
  });
}
