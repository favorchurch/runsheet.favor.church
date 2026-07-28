/**
 * Rock AttributeValue type.
 * Used for custom fields on Groups, People, etc.
 * Maps from Fluro's data fields stored directly on content objects.
 */

export interface RockAttributeValue {
  Id?: number;
  AttributeId?: number;
  AttributeName?: string;
  AttributeKey?: string;
  EntityId?: number;
  Value?: string;
  ValueFormatted?: string;
  Attribute?: any | null;
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
}
