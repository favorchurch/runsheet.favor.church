/**
 * Rock GroupMember type.
 * Maps from FluroGroupAssignment.
 *
 * Key differences:
 * - PersonId (int) instead of contacts[] array
 * - GroupRoleId (int) instead of roles[] array with string IDs
 * - GroupMemberStatus (int) instead of inferred status
 */

import { RockPerson } from './RockPerson';

export interface RockGroupMember {
  Id: number;
  Guid?: string;
  IdKey?: string;
  GroupId: number;
  GroupTypeId: number;
  PersonId: number;
  GroupRoleId: number;
  GroupMemberStatus: number; // 1=active, 2=inactive
  Note?: string | null;
  DateTimeAdded?: string | null;
  GuestCount?: number | null;
  IsNotified?: boolean;
  GroupOrder?: number | null;
  InactiveDateTime?: string | null;
  IsArchived?: boolean;
  ArchivedDateTime?: string | null;
  ArchivedByPersonAliasId?: number | null;
  CommunicationPreference?: number;

  // Expanded relations
  Person?: RockPerson | null;
  GroupRole?: any | null;
  GroupMemberRequirements?: any[];
  GroupMemberAssignments?: any[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  AttributeValues?: any;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

/** Group Member Status enum (Rock: 0 = Inactive, 1 = Active, 2 = Pending) */
export enum RockGroupMemberStatus {
  Inactive = 0,
  Active = 1,
  Pending = 2,
}

/** Known GroupRole IDs (discovered from Rock instance) */
export enum RockGroupRoleId {
  // Security Role (type 1)
  SecurityRoleMember = 1,
  SecurityRoleLeader = 2,

  // Family (type 10)
  FamilyAdult = 3,
  FamilyChild = 4,

  // Known Relationship (type 11)
  KnownRelationshipMember = 5,

  // General (type 26)
  GeneralMember = 28,
  GeneralLeader = 27,

  // Ministry Teams (type 23)
  MinistryTeamMember = 19,
  MinistryTeamLeader = 18,

  // Connect Group Section (type 24)
  ConnectGroupSectionMember = 22,

  // Connect Group (type 25)
  ConnectGroupMember = 23,
  ConnectGroupLeader = 24,
  ConnectGroupRegionalLeader = 55,
  ConnectGroupClusterHead = 56,

  // Sign-Up Group (type 37)
  SignUpGroupMember = 54,
}
