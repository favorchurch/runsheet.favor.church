/**
 * Rock Campus type.
 * Maps from FluroRealm.
 *
 * Key differences:
 * - Rock campuses are flat (no hierarchical realm tree)
 * - Id is integer (not hex string)
 * - No 'trail' of parent campuses
 */

export interface RockCampus {
  Id: number;
  Guid?: string;
  IdKey?: string;
  Name?: string;
  Description?: string;
  IsActive?: boolean;
  ShortCode?: string;
  Url?: string;
  LocationId?: number;
  PhoneNumber?: string;
  LeaderPersonAliasId?: number | null;
  ServiceTimes?: string;
  Order?: number;
  TimeZoneId?: string;
  CampusStatusValueId?: number;
  CampusTypeValueId?: number;
  TeamGroupId?: number;
  OpenedDate?: string | null;
  ClosedDate?: string | null;
  IsSystem?: boolean;
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  Location?: any | null;
  LeaderPersonAlias?: any | null;
  CampusStatusValue?: any | null;
  CampusTypeValue?: any | null;
  TeamGroup?: any | null;
  CampusSchedules?: any[];
  CampusTopics?: any[];
  Attributes?: any;
  AttributeValues?: any;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}
