/**
 * Rock Note type.
 * Maps from FluroCareNotes.
 *
 * Fluro stores care notes as Posts (type: 'post', definition: 'connectCareNotes')
 * with structured data fields (highlights, challenges, empower, etc.).
 *
 * Rock uses Notes entity with NoteTypeId for categorization.
 * The structured fields from Fluro can be stored as JSON in the Note Text field
 * or as separate Note records per field.
 */

export interface RockNote {
  Id: number;
  Guid?: string;
  NoteTypeId: number;
  EntityTypeId?: number;
  EntityId?: number;
  Caption?: string | null;
  Text?: string | null;
  IsAlert?: boolean;
  IsPrivateNote?: boolean;
  IsSystem?: boolean;
  ParentNoteId?: number | null;
  ApprovalStatus?: number; // 0=PendingApproval, 1=Approved, 2=Denied

  // Expanded relations
  NoteType?: RockNoteType | null;
  CreatedByPersonAlias?: any | null;
  EditedByPersonAlias?: any | null;

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  EditedDateTime?: string | null;
  EditedByPersonAliasId?: number | null;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

export interface RockNoteType {
  Id: number;
  Guid?: string;
  Name?: string;
  EntityTypeId?: number;
  IsSystem?: boolean;
  IconCssClass?: string | null;
  UserSelectable?: boolean;
  CssClass?: string | null;
  Order?: number;
}
