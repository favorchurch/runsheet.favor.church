import { extractRunsheetCampus, RunsheetCampusCode } from '@/lib/runsheetCampus';
import { extractChannelTime, formatChannelDateSortKey } from '@/lib/runsheetDate';
import type { PreacherNote } from '@/types/PreacherNotes';

export const PREACHER_NOTES_ATTRIBUTE_KEY = 'PreacherNotes';
export const PREACHER_NOTES_ATTRIBUTE_GUID = 'B69F2184-2101-44B4-84E3-D6B63B6CE151';
export const PREACHER_NOTES_MAX_BYTES = Math.floor(4.4 * 1024 * 1024); // 4.4 MB (~4,613,734 bytes)
export const PREACHER_NOTES_MAX_COUNT = 10;
export const PREACHER_NOTES_MAX_QUERY_STRING_LENGTH = 1800;
export const PREACHER_NOTES_MAX_NAME_LENGTH = 100;
export const PREACHER_NOTES_COUNT_ERROR_MESSAGE = 'A runsheet can hold up to 10 Preacher Notes PDFs';
export const PREACHER_NOTES_LENGTH_ERROR_MESSAGE =
  'Too many or too long Preacher Notes names; unlink one or shorten file names';

export class PreacherNotesCountLimitError extends Error {
  constructor(message = PREACHER_NOTES_COUNT_ERROR_MESSAGE) {
    super(message);
    this.name = 'PreacherNotesCountLimitError';
  }
}

export class PreacherNotesLengthLimitError extends Error {
  constructor(message = PREACHER_NOTES_LENGTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'PreacherNotesLengthLimitError';
  }
}

const VALID_CAMPUSES = new Set<string>(['MNL', 'BNE', 'SEL', 'ALL']);

/**
 * Resolves a campus code ('MNL' | 'BNE' | 'SEL' | 'ALL') from a raw campus code or runsheet title.
 */
export function resolveNotesCampus(campusOrTitle?: string | null): RunsheetCampusCode | 'ALL' {
  if (!campusOrTitle) return 'ALL';
  const trimmed = campusOrTitle.trim().toUpperCase();
  if (VALID_CAMPUSES.has(trimmed)) {
    return trimmed as RunsheetCampusCode | 'ALL';
  }
  const extracted = extractRunsheetCampus(campusOrTitle);
  return extracted || 'ALL';
}

/**
 * Builds the folder path in Rock Asset Manager: `PreacherNotes/<CAMPUS|ALL>/`.
 * Every runsheet of a campus shares one folder; file names carry the service date and time.
 */
export function buildPreacherNotesFolder(campus: string | null | undefined): string {
  return `PreacherNotes/${resolveNotesCampus(campus)}/`;
}

/**
 * Builds the storage file name `YYYY-MM-DD <Service Time> <original name>.pdf` from the
 * runsheet title (`{prefix} // {date} // {time}`). A missing date or time is left out.
 * `suffix` (2, 3, ...) is appended to the stem when Rock already holds the name.
 * Rock's uploader replaces spaces with `_` when it stores the file.
 */
export function buildPreacherNotesFileName(
  channelName: string | null | undefined,
  originalName: string | null | undefined,
  suffix?: number,
): string {
  const title = channelName || '';
  const dateKey = formatChannelDateSortKey(title);
  const date = dateKey === '9999-99-99' ? '' : dateKey;
  // Times like `11:30AM`: a colon is not a valid Windows file name character.
  const time = extractChannelTime(title).replace(/\s+/g, '').replace(/:/g, '.');

  const stem = sanitizeStorageFileName(originalName).slice(0, -4);
  const parts = [date, time, stem].filter(Boolean);
  const base = sanitizeStorageFileName(`${parts.join(' ')}.pdf`).slice(0, -4);
  return `${suffix && suffix > 1 ? `${base}_${suffix}` : base}.pdf`;
}

/**
 * Sniffs the magic bytes for a PDF document (`%PDF-`).
 */
export function isPdf(bytes: Uint8Array | ArrayBuffer | Buffer | null | undefined): boolean {
  if (!bytes) return false;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 5) return false;
  return (
    u8[0] === 0x25 && // %
    u8[1] === 0x50 && // P
    u8[2] === 0x44 && // D
    u8[3] === 0x46 && // F
    u8[4] === 0x2d    // -
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates a preacher note storage path. Accepts `PreacherNotes/(MNL|BNE|SEL|ALL)/<name>.pdf`,
 * plus the earlier per-runsheet layout `PreacherNotes/<CAMPUS>/<that channelId>/<hex>/<name>.pdf`
 * so notes linked before the flat layout still open. Rejects `..`, backslashes and a leading slash.
 * Which runsheet owns a flat path is decided by its saved list, not by the path.
 */
export function isValidNotePath(path: string | null | undefined, channelId: number | string): boolean {
  if (typeof path !== 'string' || !path) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\\')) return false;
  if (path.includes('..')) return false;

  if (/^PreacherNotes\/(MNL|BNE|SEL|ALL)\/[^/]+\.pdf$/.test(path)) return true;

  const channelStr = String(channelId).trim();
  if (!channelStr || !/^[1-9]\d*$/.test(channelStr)) return false;

  const legacy = new RegExp(
    `^PreacherNotes/(MNL|BNE|SEL|ALL)/${escapeRegex(channelStr)}/[0-9a-fA-F]+/[^/]+\\.pdf$`,
  );
  return legacy.test(path);
}

/**
 * Parses the JSON string of preacher notes.
 * Malformed, empty, or absent input returns `[]`.
 * Drops entries failing shape validation (must have non-empty name and path).
 */
export function parsePreacherNotes(raw: unknown): PreacherNote[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const results: PreacherNote[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const { name, path } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof path !== 'string' || !path.trim()) continue;

    const note: PreacherNote = {
      name: name.trim().slice(0, PREACHER_NOTES_MAX_NAME_LENGTH),
      path: path.trim(),
    };
    results.push(note);
  }
  return results;
}

/**
 * Derives a safe storage file name from the original file name:
 * takes the basename, removes /, \, .., and control characters,
 * collapses whitespace, and appends .pdf if missing.
 */
export function sanitizeStorageFileName(rawName: string | null | undefined): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'document.pdf';
  }

  // 1. Take basename (strip path separators)
  let name = rawName.split(/[/\\]/).pop() || '';

  // 2. Remove /, \, and control characters (0x00-0x1F, 0x7F)
  name = name.replace(/[/\\]/g, '').replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Separate .pdf extension if present so stem dots/doubles can be sanitized
  const hasPdfExt = /\.pdf$/i.test(name);
  if (hasPdfExt) {
    name = name.slice(0, -4);
  }

  // 4. Remove '..' anywhere
  while (name.includes('..')) {
    name = name.replace(/\.\./g, '');
  }

  // 5. Collapse whitespace and strip trailing dots from stem
  name = name.replace(/\s+/g, ' ').replace(/\.+$/, '').trim();

  if (!name) {
    return 'document.pdf';
  }

  return `${name}.pdf`;
}

/**
 * Builds a safe Content-Disposition header value with an ASCII-only fallback filename
 * and an RFC 5987 / RFC 6266 UTF-8 encoded filename*.
 */
export function formatContentDisposition(
  rawFilename: string | null | undefined,
  isDownload: boolean,
): string {
  const type = isDownload ? 'attachment' : 'inline';
  let name = (rawFilename?.trim() || 'document.pdf').toWellFormed();

  if (!name || name === '.pdf') {
    name = 'document.pdf';
  } else if (!/\.pdf$/i.test(name)) {
    name = `${name}.pdf`;
  }

  // ASCII fallback: replace non-ASCII ([^\x20-\x7E]), quotes, CR, LF, slashes with _
  let fallback = name
    .replace(/[^\x20-\x7E]|["\r\n\/\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!fallback || fallback === '.pdf' || fallback === '_.pdf' || fallback === '_') {
    fallback = 'document.pdf';
  } else if (!/\.pdf$/i.test(fallback)) {
    fallback = `${fallback}.pdf`;
  }

  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Serializes the preacher notes list to compact JSON.
 * Capping name length and dropping size/uploadedAt keeps stored query string minimal.
 */
export function serializePreacherNotes(notes: PreacherNote[]): string {
  const compact = notes.map((note) => ({
    name: note.name.trim().slice(0, PREACHER_NOTES_MAX_NAME_LENGTH),
    path: note.path.trim(),
  }));
  return JSON.stringify(compact);
}

/**
 * Computes the query string for Rock's /ContentChannels/AttributeValue endpoint,
 * as `new URLSearchParams({ attributeKey, attributeValue }).toString()`.
 */
export function computePreacherNotesQueryString(
  notes: PreacherNote[] | string,
  attributeKey = PREACHER_NOTES_ATTRIBUTE_KEY,
): string {
  const attributeValue = typeof notes === 'string' ? notes : serializePreacherNotes(notes);
  return new URLSearchParams({ attributeKey, attributeValue }).toString();
}
