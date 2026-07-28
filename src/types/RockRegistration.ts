/**
 * Rock Registration type.
 * Maps from PortalConnectSignup.
 *
 * Fluro uses Interactions (type: 'interaction', definition: 'mnlSignUpForAConnectGroup')
 * Rock uses Registrations linked to RegistrationInstances.
 *
 * Key differences:
 * - Integer IDs instead of hex strings
 * - PersonAliasId instead of contact reference
 * - RegistrationInstanceId links to the signup form/group
 * - No embedded rawData — contact info comes from Person record
 */

import { RockPerson } from './RockPerson';

export interface RockRegistration {
  Id: number;
  Guid?: string;
  RegistrationInstanceId: number;
  PersonAliasId: number;
  ConfirmationEmail?: string;
  DiscountCode?: string;
  DiscountPercentage?: number;
  DiscountAmount?: number;
  GroupId?: number | null;
  IsTemporary?: boolean;

  // Expanded relations
  RegistrantPersonAlias?: {
    Id: number,
    PersonId: number,
    Person?: RockPerson,
  } | null;
  RegistrationInstance?: RockRegistrationInstance | null;

  // Tags (loaded via TaggedItems, not a native Rock field)
  tags?: number[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

export interface RockRegistrationInstance {
  Id: number;
  Guid?: string;
  Name?: string;
  RegistrationTemplateId: number;
  IsActive?: boolean;
  StartDateTime?: string | null;
  EndDateTime?: string | null;
  MaxAttendees?: number;
  ContactPersonAliasId?: number | null;
  ContactPhone?: string | null;
  ContactEmail?: string | null;
  AccountId?: number | null;

  // Expanded relations
  RegistrationTemplate?: any | null;
  Registrations?: RockRegistration[];
  Linkages?: any[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}
