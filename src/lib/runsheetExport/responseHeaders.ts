export const EXPORT_CACHE_CONTROL = 'private, no-store';

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug of the runsheet's full name, e.g. `bne-sunday-october-11-2026-9am.pdf`. */
export function buildExportFilename(channelName: string, channelId: number): string {
  const slug = slugify(channelName) || `runsheet-${channelId}`;
  return `${slug}.pdf`;
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
