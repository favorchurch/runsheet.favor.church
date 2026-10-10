import { extractChannelDate, extractChannelTitleDisplay } from '@/lib/runsheetDate';

export const EXPORT_CACHE_CONTROL = 'private, no-store';

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatIsoDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `<slug-of-title>-<yyyy-mm-dd>.pdf`; the date suffix is omitted when the name has no date. */
export function buildExportFilename(channelName: string, channelId: number): string {
  const slug = slugify(extractChannelTitleDisplay(channelName)) || `runsheet-${channelId}`;
  const date = extractChannelDate(channelName);
  const suffix = date && !isNaN(date.getTime()) ? `-${formatIsoDate(date)}` : '';
  return `${slug}${suffix}.pdf`;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildContentDisposition(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}
