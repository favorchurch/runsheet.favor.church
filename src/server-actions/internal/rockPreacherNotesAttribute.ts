import 'server-only';

import {
  PREACHER_NOTES_ATTRIBUTE_GUID,
  PREACHER_NOTES_ATTRIBUTE_KEY,
  parsePreacherNotes,
  serializePreacherNotes,
} from '@/lib/preacherNotes';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import type { PreacherNote } from '@/types/PreacherNotes';

export const CONTENT_CHANNEL_ENTITY_TYPE_NAME = 'Rock.Model.ContentChannel';
export const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = '13';
export const MEMO_FIELD_TYPE_CLASS = 'Rock.Field.Types.MemoFieldType';

let cachedAttributeId: number | null = null;
let cachedEntityTypeId: number | null = null;
let cachedFieldTypeId: number | null = null;

/**
 * Resets the in-memory cache for the PreacherNotes attribute metadata (used in unit tests).
 */
export function resetPreacherNotesAttributeCache(): void {
  cachedAttributeId = null;
  cachedEntityTypeId = null;
  cachedFieldTypeId = null;
}

/**
 * Resolves the EntityTypeId for Rock.Model.ContentChannel.
 */
export async function resolveContentChannelEntityTypeId(): Promise<number> {
  if (cachedEntityTypeId !== null) return cachedEntityTypeId;

  const entityTypes = (await rockGet('/EntityTypes', {
    $filter: `Name eq '${CONTENT_CHANNEL_ENTITY_TYPE_NAME}'`,
    $select: 'Id',
  })) as Array<{ Id: number }>;

  const id = entityTypes?.[0]?.Id;
  if (!id) {
    throw new Error(`Could not resolve EntityTypeId for '${CONTENT_CHANNEL_ENTITY_TYPE_NAME}'`);
  }

  cachedEntityTypeId = id;
  return id;
}

/**
 * Resolves the FieldTypeId for Rock MemoFieldType (multi-line text).
 */
export async function resolveMemoFieldTypeId(): Promise<number> {
  if (cachedFieldTypeId !== null) return cachedFieldTypeId;

  const fieldTypes = (await rockGet('/FieldTypes', {
    $filter: `Class eq '${MEMO_FIELD_TYPE_CLASS}' or Name eq 'Memo'`,
    $select: 'Id',
  })) as Array<{ Id: number }>;

  const id = fieldTypes?.[0]?.Id || 2; // Rock default Memo FieldTypeId is 2
  cachedFieldTypeId = id;
  return id;
}

/**
 * Looks up the PreacherNotes Attribute in Rock without creating it.
 * Used during reads so read operations never create the attribute.
 */
export async function findPreacherNotesAttributeId(): Promise<number | null> {
  if (cachedAttributeId !== null) return cachedAttributeId;

  const entityTypeId = await resolveContentChannelEntityTypeId();
  const existing = (await rockGet(
    '/Attributes',
    {
      $filter: `Guid eq guid'${PREACHER_NOTES_ATTRIBUTE_GUID}' or (EntityTypeId eq ${entityTypeId} and Key eq '${PREACHER_NOTES_ATTRIBUTE_KEY}' and EntityTypeQualifierColumn eq 'ContentChannelTypeId' and EntityTypeQualifierValue eq '${RUNSHEET_CONTENT_CHANNEL_TYPE_ID}')`,
      $select: 'Id',
    },
    true,
  )) as Array<{ Id: number }>;

  if (existing?.[0]?.Id) {
    cachedAttributeId = existing[0].Id;
    return cachedAttributeId;
  }

  return null;
}

/**
 * Ensures the PreacherNotes attribute exists on ContentChannel (TypeId 13).
 * Fixed Guid, Memo FieldType, qualifier ContentChannelTypeId=13.
 * Only called on writes, and is idempotent (subsequent calls make no POST).
 */
export async function ensurePreacherNotesAttribute(): Promise<number> {
  if (cachedAttributeId !== null) {
    return cachedAttributeId;
  }

  const existingId = await findPreacherNotesAttributeId();
  if (existingId !== null) {
    cachedAttributeId = existingId;
    return cachedAttributeId;
  }

  const entityTypeId = await resolveContentChannelEntityTypeId();
  const memoFieldTypeId = await resolveMemoFieldTypeId();

  const result = (await rockPost('/Attributes', {
    Guid: PREACHER_NOTES_ATTRIBUTE_GUID,
    Key: PREACHER_NOTES_ATTRIBUTE_KEY,
    Name: 'Preacher Notes',
    FieldTypeId: memoFieldTypeId,
    EntityTypeId: entityTypeId,
    EntityTypeQualifierColumn: 'ContentChannelTypeId',
    EntityTypeQualifierValue: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
    IsGridColumn: false,
    IsMultiValue: false,
    IsRequired: false,
  })) as number | { Id?: number };

  const newId = typeof result === 'number' ? result : result?.Id;
  if (!newId || !Number.isSafeInteger(newId)) {
    throw new Error('Failed to create PreacherNotes ContentChannel attribute in Rock');
  }

  cachedAttributeId = newId;
  return newId;
}

/**
 * Reads the ContentChannel PreacherNotes attribute value for a channelId.
 * Does NOT ensure the attribute exists (never mutates Rock on read).
 * Returns `[]` if the attribute or attribute value is missing or empty.
 */
export async function getPreacherNotesAttributeValue(channelId: number): Promise<PreacherNote[]> {
  const attributeId = await findPreacherNotesAttributeId();
  if (!attributeId) {
    return [];
  }

  const values = (await rockGet(
    '/AttributeValues',
    {
      $filter: `AttributeId eq ${attributeId} and EntityId eq ${channelId}`,
      $select: 'Id,Value',
    },
    true,
  )) as Array<{ Id: number; Value?: string }>;

  const rawValue = values?.[0]?.Value;
  if (!rawValue) return [];

  return parsePreacherNotes(rawValue);
}

/**
 * Writes the ContentChannel PreacherNotes attribute value for a channelId.
 * Ensures the attribute exists only on write.
 * Uses rockPatch if an AttributeValue record exists, or rockPost if new.
 */
export async function setPreacherNotesAttributeValue(
  channelId: number,
  notes: PreacherNote[] | string,
): Promise<PreacherNote[]> {
  const attributeId = await ensurePreacherNotesAttribute();
  const serialized = typeof notes === 'string' ? notes : serializePreacherNotes(notes);

  const existing = (await rockGet(
    '/AttributeValues',
    {
      $filter: `AttributeId eq ${attributeId} and EntityId eq ${channelId}`,
      $select: 'Id,Value',
    },
    true,
  )) as Array<{ Id: number; Value?: string }>;

  if (existing?.[0]?.Id) {
    await rockPatch(`/AttributeValues/${existing[0].Id}`, { Value: serialized });
  } else {
    await rockPost('/AttributeValues', {
      AttributeId: attributeId,
      EntityId: channelId,
      Value: serialized,
    });
  }

  return parsePreacherNotes(serialized);
}
