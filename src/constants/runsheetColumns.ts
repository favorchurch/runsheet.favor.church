import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

/**
 * Columns used when Rock RMS returns no item attributes for a channel — for
 * example a newly created channel whose attributes have not been provisioned
 * yet. Ids match the live Rock attributes so saves still land on the right rows.
 */
export const FALLBACK_RUNSHEET_COLUMNS: DynamicAttributeColumn[] = [
  { id: 7626, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
  { id: 10266, key: 'DESCRIPTION', name: 'Detail' },
  { id: 7878, key: 'MAININSTRUMENT', name: 'Main Instrument' },
  { id: 7616, key: 'LED WALL', name: 'LED / Live Screens' },
  { id: 7617, key: 'OVERLAYBROADCAST', name: 'Overlay / Broadcast' },
  { id: 7618, key: 'LIGHTING', name: 'Lighting' },
  { id: 7619, key: 'AUDIO', name: 'Audio' },
];

/**
 * Rock's Person field type. Cells backed by a Person attribute use the people
 * picker instead of the rich-text editor so the saved value stays resolvable.
 */
export const ROCK_PERSON_FIELD_TYPE_ID = 18;

/** Shared row-lineage key used to match rows across sibling runsheets. Never rendered as a grid column. */
export const SIBLINGKEY_ATTRIBUTE_KEY = 'SIBLINGKEY';

/** Attribute keys that exist in Rock but are never rendered as a dynamic grid column. */
export const HIDDEN_ATTRIBUTE_KEYS = ['DURATION', 'SONGITEMID', SIBLINGKEY_ATTRIBUTE_KEY];

/** Keys that hold a person's name even when the Rock field type is plain text. */
const PERSON_KEY_FRAGMENTS = ['PLATFORM', 'ANCHOR', 'PREACHER'];

export function isPersonColumn(column: Pick<DynamicAttributeColumn, 'key' | 'fieldTypeId'>): boolean {
  if (column.fieldTypeId === ROCK_PERSON_FIELD_TYPE_ID) return true;

  const key = column.key.toUpperCase();
  return PERSON_KEY_FRAGMENTS.some((fragment) => key.includes(fragment));
}

/**
 * Attribute keys that the grid renders through dedicated columns rather than
 * the dynamic attribute loop: the activity title replaces the Title column and
 * duration drives the Start/End/Duration columns.
 */
export const RESERVED_RUNSHEET_COLUMN_KEYS = ['ACTIVITYTITLE', 'ACTIVITY TITLE', 'TITLE'];

/** Named row fields kept in step with their attribute values. */
type LegacyRunsheetField =
  | 'detail'
  | 'anchorPreacher'
  | 'mainInstrument'
  | 'ledLiveScreens'
  | 'overlayBroadcast'
  | 'lighting'
  | 'audio';

/**
 * Maps a Rock attribute key to the named field that mirrors it.
 *
 * Favor's Rock channels are not consistent about these keys — `DETIAL` is a
 * long-standing typo in Rock itself, and `PLATFORM` was renamed from
 * `ANCHORPREACHER` — so both spellings resolve to the same field.
 */
export const LEGACY_FIELD_BY_ATTRIBUTE_KEY: Record<string, LegacyRunsheetField> = {
  DESCRIPTION: 'detail',
  DETIAL: 'detail',
  PLATFORM: 'anchorPreacher',
  ANCHORPREACHER: 'anchorPreacher',
  MAININSTRUMENT: 'mainInstrument',
  'LED WALL': 'ledLiveScreens',
  LEDLIVESCREENS: 'ledLiveScreens',
  OVERLAYBROADCAST: 'overlayBroadcast',
  LIGHTING: 'lighting',
  AUDIO: 'audio',
};

/** Reads a cell, falling back to the named field when the attribute is absent. */
export function readRunsheetCellValue(item: RunsheetItemRow, key: string): string {
  const direct = item.attributeValues?.[key];
  if (direct !== undefined) return direct;

  const legacyField = LEGACY_FIELD_BY_ATTRIBUTE_KEY[key];
  return (legacyField ? item[legacyField] : undefined) ?? '';
}

/** Writes a cell and keeps the named field it mirrors in step. */
export function writeRunsheetCellValue(item: RunsheetItemRow, key: string, value: string): void {
  item.attributeValues = { ...(item.attributeValues || {}), [key]: value };

  const legacyField = LEGACY_FIELD_BY_ATTRIBUTE_KEY[key];
  if (legacyField) item[legacyField] = value;
}
