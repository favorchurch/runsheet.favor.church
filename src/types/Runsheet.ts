/**
 * Shapes for the Rock RMS content channel that backs a service runsheet.
 *
 * A runsheet is a Rock `ContentChannel`; each segment is a `ContentChannelItem`
 * whose columns are the channel's item attributes, so the grid's columns are
 * discovered at runtime rather than hardcoded.
 */

/** One Rock item attribute rendered as a grid column. */
export interface DynamicAttributeColumn {
  id: number;
  key: string;
  name: string;
  /** Rock field type id; `18` is Person (see `ROCK_PERSON_FIELD_TYPE_ID`). */
  fieldTypeId?: number;
}

/** One runsheet segment (a row in the grid). */
export interface RunsheetItemRow {
  /** Number for rows that exist in Rock, temporary string for unsaved rows. */
  id: number | string;
  isNew?: boolean;
  isDeleted?: boolean;
  isDirty?: boolean;
  /** Plain-text title mirrored to Rock's `ContentChannelItem.Title`. */
  title: string;
  order: number;
  startDateTime?: string;
  /** Minutes; may be fractional because durations are typed as `HH:MM:SS`. */
  duration: number;
  /** Attribute key to stored value. Text columns hold rich-text HTML. */
  attributeValues: Record<string, string>;
  detail?: string;
  /** Rock `ContentChannelItem.Id` of the linked Song, when the title cell is a music cell. */
  songItemId?: number | null;
  changedKeys?: string[];
  anchorPreacher?: string;
  mainInstrument?: string;
  ledLiveScreens?: string;
  overlayBroadcast?: string;
  lighting?: string;
  audio?: string;
}

export interface ItemResult {
  clientId: number | string;
  rockId?: number;
  ok: boolean;
  error?: string;
}

export interface BulkSaveResult {
  success: boolean;
  error?: string;
  results?: ItemResult[];
}

export interface RunsheetDetails {
  channelId: number;
  name: string;
  subtitle?: string;
  contentChannelTypeId: number;
  columns: DynamicAttributeColumn[];
  items: RunsheetItemRow[];
}
