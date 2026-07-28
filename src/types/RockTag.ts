/**
 * Rock Tag type.
 * Maps from FluroTag.
 *
 * Key differences:
 * - Id is integer (not hex string)
 * - Name instead of title
 * - EntityTypeId for scoping (instead of campuses)
 * - IconCssClass and BackgroundColor for display
 */

export interface RockTag {
  Id: number;
  Guid?: string;
  IdKey?: string;
  Name?: string;
  EntityTypeId?: number;
  IsSystem?: boolean;
  OwnerPersonAliasId?: number | null;
  IsActive?: boolean;
  CategoryId?: number | null;
  IconCssClass?: string;
  BackgroundColor?: string;
  Order?: number;

  // Expanded
  EntityType?: any | null;
  Category?: any | null;
  OwnerPersonAlias?: any | null;

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  AttributeValues?: any;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}
