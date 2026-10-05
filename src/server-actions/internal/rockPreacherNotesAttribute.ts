import 'server-only';

import {
  PREACHER_NOTES_ATTRIBUTE_GUID,
  PREACHER_NOTES_ATTRIBUTE_KEY,
  PREACHER_NOTES_MAX_COUNT,
  parsePreacherNotes,
  serializePreacherNotes,
} from '@/lib/preacherNotes';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import type { PreacherNote } from '@/types/PreacherNotes';

export const CONTENT_CHANNEL_ENTITY_TYPE_NAME = 'Rock.Model.ContentChannel';
export const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = '13';
export const MEMO_FIELD_TYPE_CLASS = 'Rock.Field.Types.MemoFieldType';

let cachedAttributeId: number | null = null;
let cachedEntityTypeId: number | null = null;
let cachedFieldTypeId: number | null = null;
let ensureAttributePromise: Promise<number> | null = null;

/**
 * Resets the in-memory cache for the PreacherNotes attribute metadata (used in unit tests).
 */
export function resetPreacherNotesAttributeCache(): void {
  cachedAttributeId = null;
  cachedEntityTypeId = null;
  cachedFieldTypeId = null;
  ensureAttributePromise = null;
  resetPreacherNotesChannelQueues();
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

  if (ensureAttributePromise) {
    return ensureAttributePromise;
  }

  ensureAttributePromise = (async () => {
    try {
      const existingId = await findPreacherNotesAttributeId();
      if (existingId !== null) {
        cachedAttributeId = existingId;
        return cachedAttributeId;
      }

      const entityTypeId = await resolveContentChannelEntityTypeId();
      const memoFieldTypeId = await resolveMemoFieldTypeId();

      try {
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
      } catch (postError) {
        // If POST failed (e.g. concurrent creation race on Rock side), re-check if attribute exists now
        const recheckId = await findPreacherNotesAttributeId();
        if (recheckId !== null) {
          cachedAttributeId = recheckId;
          return recheckId;
        }
        throw postError;
      }
    } finally {
      ensureAttributePromise = null;
    }
  })();

  return ensureAttributePromise;
}

/**
 * Reads the ContentChannel PreacherNotes attribute value for a channelId.
 * Does NOT ensure the attribute exists (never mutates Rock on read).
 * Reads via rockGet('/ContentChannels/<id>', { loadAttributes: 'simple' }, true)
 * taking AttributeValues.PreacherNotes.Value (missing -> []).
 * NEVER calls /AttributeValues.
 */
export async function getPreacherNotesAttributeValue(channelId: number): Promise<PreacherNote[]> {
  const channel = (await rockGet(
    `/ContentChannels/${channelId}`,
    { loadAttributes: 'simple' },
    true,
  )) as { AttributeValues?: Record<string, { Value?: string }> } | null;

  const rawValue = channel?.AttributeValues?.[PREACHER_NOTES_ATTRIBUTE_KEY]?.Value;
  if (!rawValue) return [];

  return parsePreacherNotes(rawValue);
}

/**
 * Writes the ContentChannel PreacherNotes attribute value for a channelId.
 * Ensures the attribute exists only on write.
 * Writes via rockPost('/ContentChannels/AttributeValue/<id>', undefined, { attributeKey: 'PreacherNotes', attributeValue: <compact JSON> }).
 * NEVER calls /AttributeValues.
 */
export async function setPreacherNotesAttributeValue(
  channelId: number,
  notes: PreacherNote[] | string,
): Promise<PreacherNote[]> {
  const parsedNotes = typeof notes === 'string' ? parsePreacherNotes(notes) : notes;
  if (parsedNotes.length > PREACHER_NOTES_MAX_COUNT) {
    throw new Error('A runsheet can hold up to 10 Preacher Notes PDFs');
  }

  await ensurePreacherNotesAttribute();
  const serialized = typeof notes === 'string' ? notes : serializePreacherNotes(notes);

  await rockPost(
    `/ContentChannels/AttributeValue/${channelId}`,
    undefined,
    {
      attributeKey: PREACHER_NOTES_ATTRIBUTE_KEY,
      attributeValue: serialized,
    },
  );

  return parsePreacherNotes(serialized);
}

/**
 * In-process promise queue per channelId to serialize read-modify-write operations
 * (e.g. concurrent uploads or unlinks for the same runsheet channel).
 *
 * NOTE: Cross-instance races remain in multi-instance or serverless environments
 * because Rock RMS does not support atomic AttributeValue updates or conditional ETag writes.
 */
const channelQueues = new Map<number, Promise<unknown>>();

export function resetPreacherNotesChannelQueues(): void {
  channelQueues.clear();
}

export async function serializeChannelMutation<T>(
  channelId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = channelQueues.get(channelId) ?? Promise.resolve();

  const task = async () => {
    await prev.catch(() => {});
    return await fn();
  };

  const nextPromise = task();
  channelQueues.set(channelId, nextPromise);

  try {
    return await nextPromise;
  } finally {
    if (channelQueues.get(channelId) === nextPromise) {
      channelQueues.delete(channelId);
    }
  }
}

/**
 * Reads, modifies, and writes the PreacherNotes attribute for a channelId atomically
 * within this process, serialized per channelId.
 * Re-reads the current list inside the critical section.
 *
 * NOTE: Cross-instance races remain in multi-instance or serverless environments
 * because Rock RMS does not support atomic AttributeValue updates or conditional ETag writes.
 */
export async function mutatePreacherNotesAttribute(
  channelId: number,
  mutate: (current: PreacherNote[]) => PreacherNote[] | Promise<PreacherNote[]>,
): Promise<PreacherNote[]> {
  return serializeChannelMutation(channelId, async () => {
    const current = await getPreacherNotesAttributeValue(channelId);
    const updated = await mutate(current);

    // If the list hasn't changed (e.g. unlinking a path not in the list), skip write
    if (
      current.length === updated.length &&
      current.every((note, i) => note.path === updated[i]?.path && note.name === updated[i]?.name)
    ) {
      return current;
    }

    return await setPreacherNotesAttributeValue(channelId, updated);
  });
}

