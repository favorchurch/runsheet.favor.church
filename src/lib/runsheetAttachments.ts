/**
 * The `PREACHERNOTES` item attribute holds a JSON array of PDF attachments
 * stored in Rock's Asset Manager. Everything here is pure: no Rock I/O.
 *
 * A value this module cannot understand is read as "no attachments" rather
 * than throwing, so a hand-edited Rock value can never break the grid.
 */
import { ALL_CAMPUSES, extractRunsheetCampus, RUNSHEET_CAMPUS_CODES } from '@/lib/runsheetCampus';

export const PREACHER_NOTES_ATTRIBUTE_KEY = 'PREACHERNOTES';

/** Asset Manager root folder; every attachment key starts here. */
export const ATTACHMENT_ROOT = 'PreacherNotes';

export interface RunsheetAttachment {
  /** Asset Manager key: its path within the storage provider. */
  key: string;
  name: string;
  size: number;
  /** ISO 8601. */
  uploadedAt: string;
}

function isAttachment(value: unknown): value is RunsheetAttachment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    typeof candidate.uploadedAt === 'string'
  );
}

export function parseAttachments(value: string | undefined | null): RunsheetAttachment[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAttachment).map((entry) => ({
      key: entry.key,
      name: entry.name,
      size: entry.size,
      uploadedAt: entry.uploadedAt,
    }));
  } catch {
    return [];
  }
}

/** An empty list stores an empty string so Rock keeps no stray `[]` rows. */
export function serializeAttachments(entries: RunsheetAttachment[]): string {
  return entries.length ? JSON.stringify(entries) : '';
}

function slugifyFilename(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').filter(Boolean).join('-');
  return (
    base
      .toLowerCase()
      .replace(/\.pdf$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'notes'
  ) + '.pdf';
}

/**
 * `PreacherNotes/<CAMPUS>/<itemId>/<random>/<slug>.pdf`.
 *
 * The random segment keeps the URL unguessable from a service date or a
 * preacher's name. That is obscurity, not security — see the spec.
 */
export function buildAttachmentKey(
  channelName: string,
  itemId: number,
  filename: string,
  random: string = Math.random().toString(36).slice(2, 10),
): string {
  const campus = extractRunsheetCampus(channelName) || ALL_CAMPUSES;
  return `${ATTACHMENT_ROOT}/${campus}/${itemId}/${random}/${slugifyFilename(filename)}`;
}

const ALLOWED_FOLDERS = [...RUNSHEET_CAMPUS_CODES, ALL_CAMPUSES];

/** Guards the read and delete routes against reading arbitrary provider paths. */
export function isAllowedAttachmentKey(key: string): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) return false;
  if (!key.toLowerCase().endsWith('.pdf')) return false;
  const segments = key.split('/');
  if (segments.length < 5) return false;
  if (segments[0] !== ATTACHMENT_ROOT) return false;
  return ALLOWED_FOLDERS.includes(segments[1] as (typeof ALLOWED_FOLDERS)[number]);
}
