/**
 * Rock Person type.
 * Maps from FluroContact.
 *
 * Key differences from Fluro:
 * - Id is integer (not 24-char hex string)
 * - Gender is integer enum (0=unknown, 1=male, 2=female)
 * - No direct 'age' field (derive from BirthDate)
 * - No 'campuses' (use PrimaryCampusId)
 * - Email is a single string (not array)
 * - PhoneNumbers is an array of objects
 */

export interface RockPhoneNumber {
  Id?: number;
  Number?: string;
  NumberFormatted?: string;
  PhoneNumberTypeValueId?: number;
  IsSystem?: boolean;
  IsMessagingEnabled?: boolean;
  CountryCode?: string;
}

export interface RockPerson {
  Id: number;
  Guid?: string;
  IdKey?: string;
  FirstName?: string;
  LastName?: string;
  NickName?: string;
  FullName?: string;
  Initials?: string;
  Email?: string;
  EmailPreference?: number;
  IsEmailActive?: boolean;
  Gender?: number; // 0=unknown, 1=male, 2=female
  BirthDate?: string | null;
  PrimaryCampusId?: number;
  PrimaryAliasId?: number;
  PrimaryFamilyId?: number;
  RecordStatusValueId?: number; // 3=Active, 4=Inactive, 5=Pending
  RecordTypeValueId?: number; // 1=Person, 2=Business
  ConnectionStatusValueId?: number; // 65=Leader, 66=Guest, 67=New
  PhoneNumbers?: RockPhoneNumber[];
  GivingId?: string;
  GivingLeaderId?: number;
  IsDeceased?: boolean;
  IsLockedAsChild?: boolean;
  IsSystem?: boolean;
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
  PhotoId?: number | null;
  PhotoUrl?: string | null;
}

/** Subset of RockPerson for guestlist/list views */
export type RockPersonSimple = Pick<RockPerson, 'Id' | 'FirstName' | 'LastName' | 'NickName' | 'Email' | 'Gender' | 'PrimaryCampusId'>;

/** Gender enum matching Rock's integer values */
export enum RockGender {
  Unknown = 0,
  Male = 1,
  Female = 2,
}

/** Record Status DefinedValue IDs */
export enum RockRecordStatus {
  Active = 3,
  Inactive = 4,
  Pending = 5,
}

/** Connection Status DefinedValue IDs */
export enum RockConnectionStatus {
  Leader = 65,
  Guest = 66,
  New = 67,
}
