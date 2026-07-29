import 'server-only';

import {
  CONNECT_GROUP_ATTRIBUTE_KEYS,
  CONNECT_GROUP_ATTRIBUTE_SPECS,
  CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY,
  joinDelimitedValues,
} from '@/util-connect/connectGroupAttributes';
import { RockAttributeValue } from '@/types/RockAttributeValue';
import { RockGroupType } from '@/types/RockGroup';
import { rockGet, rockPatch, rockPost } from './rockFetch';

export interface RockAttributeDefinition {
  Id: number;
  Key: string;
  Name?: string;
  EntityTypeId?: number;
  EntityTypeQualifierColumn?: string | null;
  EntityTypeQualifierValue?: string | null;
  FieldTypeId?: number;
  Order?: number;
  IsRequired?: boolean;
  IsMultiValue?: boolean;
}

/**
 * Normalize Rock's expanded AttributeValues response into the array shape used
 * by portal model helpers.
 *
 * Rock may return attributes as an object keyed by attribute key or as an
 * array, depending on endpoint parameters and expansion behavior.
 */
export function normalizeRockAttributeValues(
  attributeValues: unknown,
): RockAttributeValue[] | undefined {
  if (!attributeValues) return undefined;
  if (Array.isArray(attributeValues))
    return attributeValues as RockAttributeValue[];
  if (typeof attributeValues !== 'object') return undefined;

  return Object.entries(attributeValues as Record<string, unknown>).map(
    ([attributeKey, rawValue]) => {
      const source =
        rawValue && typeof rawValue === 'object'
          ? (rawValue as Record<string, unknown>)
          : {};
      const value = source.Value ?? source.value ?? rawValue;

      return {
        Id: typeof source.Id === 'number' ? source.Id : undefined,
        AttributeId:
          typeof source.AttributeId === 'number'
            ? source.AttributeId
            : undefined,
        AttributeKey: attributeKey,
        AttributeName:
          typeof source.AttributeName === 'string'
            ? source.AttributeName
            : typeof source.Name === 'string'
              ? source.Name
              : undefined,
        EntityId:
          typeof source.EntityId === 'number' ? source.EntityId : undefined,
        Value:
          value === undefined || value === null ? undefined : String(value),
        ValueFormatted:
          typeof source.ValueFormatted === 'string'
            ? source.ValueFormatted
            : value === undefined || value === null
              ? undefined
              : String(value),
      } satisfies RockAttributeValue;
    },
  );
}

/**
 * Read only the canonical Group Type 25 subtitle attribute definitions.
 */
export async function rockGetConnectGroupAttributeDefinitions(): Promise<
  RockAttributeDefinition[]
> {
  const definitions = (await rockGet('/Attributes', {
    $filter: `EntityTypeQualifierColumn eq 'GroupTypeId' and EntityTypeQualifierValue eq '${RockGroupType.ConnectGroup}'`,
    $select:
      'Id,Key,Name,EntityTypeId,EntityTypeQualifierColumn,EntityTypeQualifierValue,FieldTypeId,Order,IsRequired,IsMultiValue',
    $top: 200,
  })) as RockAttributeDefinition[];

  return definitions.filter((definition) =>
    Object.values(CONNECT_GROUP_ATTRIBUTE_KEYS).includes(
      definition.Key as (typeof CONNECT_GROUP_ATTRIBUTE_KEYS)[keyof typeof CONNECT_GROUP_ATTRIBUTE_KEYS],
    ),
  );
}

/**
 * Require the full Connect Group subtitle schema before saving subtitle data.
 *
 * The thrown setup hint points agents and operators to the provisioning script
 * instead of letting a partial attribute write drift silently.
 */
export async function rockRequireConnectGroupAttributeDefinitions(): Promise<
  Record<
    (typeof CONNECT_GROUP_ATTRIBUTE_KEYS)[keyof typeof CONNECT_GROUP_ATTRIBUTE_KEYS],
    RockAttributeDefinition
  >
> {
  const definitions = await rockGetConnectGroupAttributeDefinitions();
  const byKey = new Map(
    definitions.map((definition) => [definition.Key, definition]),
  );
  const missing = CONNECT_GROUP_ATTRIBUTE_SPECS.filter(
    (spec) => !byKey.has(spec.key),
  ).map((spec) => spec.key);

  if (missing.length) {
    throw new Error(
      `Missing Group Type 25 subtitle attributes: ${missing.join(', ')}. Run ext/ensure-rock-connect-group-type-25.ts first.`,
    );
  }

  return Object.fromEntries(
    CONNECT_GROUP_ATTRIBUTE_SPECS.map((spec) => [
      spec.key,
      byKey.get(spec.key)!,
    ]),
  ) as Record<
    (typeof CONNECT_GROUP_ATTRIBUTE_KEYS)[keyof typeof CONNECT_GROUP_ATTRIBUTE_KEYS],
    RockAttributeDefinition
  >;
}

function formatRockAttributeValue(
  rawValue: string | string[] | number | null | undefined,
): string {
  return (
    (Array.isArray(rawValue) || typeof rawValue === 'string'
      ? joinDelimitedValues(rawValue)
      : rawValue === null || rawValue === undefined
        ? ''
        : String(rawValue)) ?? ''
  );
}

/**
 * Upsert a Rock AttributeValue for any entity type, preserving explicit clears.
 *
 * Rock PATCH requests must receive `Value: ""` when an attribute is cleared;
 * omitting the value leaves stale metadata behind.
 */
export async function rockUpsertEntityAttributeValue(
  entityId: number,
  attributeId: number,
  rawValue: string | string[] | number | null | undefined,
): Promise<void> {
  const value = formatRockAttributeValue(rawValue);

  const existing = (await rockGet('/AttributeValues', {
    $filter: `AttributeId eq ${attributeId} and EntityId eq ${entityId}`,
    $select: 'Id,AttributeId,EntityId,Value',
    $top: 1,
  })) as RockAttributeValue[];

  if (existing.length) {
    await rockPatch(`/AttributeValues/${existing[0].Id}`, { Value: value });
    return;
  }

  await rockPost('/AttributeValues', {
    AttributeId: attributeId,
    EntityId: entityId,
    Value: value,
  });
}

/**
 * Upsert a Rock AttributeValue for a group, preserving explicit clears.
 */
export async function rockUpsertGroupAttributeValue(
  entityId: number,
  attributeId: number,
  rawValue: string | string[] | number | null | undefined,
): Promise<void> {
  await rockUpsertEntityAttributeValue(entityId, attributeId, rawValue);
}

/**
 * Resolve the AttributeId for ConnectCollectingMembers on GroupType 25.
 * Used internally by actions that need to read/write the collecting-members flag.
 * Throws if not provisioned.
 */
export async function rockResolveConnectCollectingMembersAttributeId(): Promise<number> {
  // Read live (noCache): this gates a write and treats "empty" as a hard error,
  // and provisioning runs out-of-band (ext script) so the app cache isn't busted
  // when the attribute is created. Low-frequency call (write path only).
  const attributeDefs = (await rockGet(
    '/Attributes',
    {
      $filter: `Key eq '${CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY}' and EntityTypeQualifierColumn eq 'GroupTypeId' and EntityTypeQualifierValue eq '${RockGroupType.ConnectGroup}'`,
      $select: 'Id,Key',
      $top: 1,
    },
    true
  )) as RockAttributeDefinition[];

  if (!attributeDefs.length) {
    throw new Error(
      `ConnectCollectingMembers attribute not provisioned for Group Type 25. Run ext/ensure-rock-connect-group-type-25.ts first.`
    );
  }

  return attributeDefs[0].Id;
}

/**
 * Set the ConnectCollectingMembers attribute value to 'True' or 'False'.
 * Best-effort: logs and swallows errors if attribute is not provisioned.
 * Used for auto-reconciliation in event creation.
 */
export async function rockSetConnectCollectingMembersValue(
  groupId: number,
  value: boolean
): Promise<void> {
  try {
    const attributeId = await rockResolveConnectCollectingMembersAttributeId();
    const rawValue = value ? 'True' : 'False';
    await rockUpsertGroupAttributeValue(groupId, attributeId, rawValue);
  } catch (err) {
    console.warn(
      `[rockSetConnectCollectingMembersValue] Could not set flag for group ${groupId}:`,
      err instanceof Error ? err.message : String(err)
    );
    // Best-effort: don't fail event creation if attribute is not provisioned
  }
}
