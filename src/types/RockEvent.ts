/**
 * Rock Event and Attendance Occurrence types.
 *
 * Key architectural difference:
 * - Legacy: EventItem (type) → EventItemOccurrence (instance) → Attendance (record)
 * - New (Attendance-First): AttendanceOccurrence (instance linked to Group) → Attendance (record)
 *
 * The Connect Portal has migrated to the Attendance-First model for stability.
 * EventItem and EventItemOccurrence types are kept for backward compatibility.
 */

import { RockCampus } from './RockCampus';
import { RockAttributeValue } from './RockAttributeValue';

/** EventItem = the event type/template (Legacy model) */
export interface RockEventItem {
  Id: number;
  Guid?: string;
  IdKey?: string;
  Name?: string;
  Description?: string;
  IsActive?: boolean;
  IsApproved?: boolean;
  AllowRegistration?: boolean;
  RegistrationTemplateId?: number | null;
  EventCalendarId?: number | null;
  MaxOccurrenceRegistrants?: number | null;

  // Expanded
  EventItemOccurrences?: RockEventItemOccurrence[];
  EventCalendar?: any | null;
  RegistrationTemplate?: any | null;
  ContentChannelItems?: any[];
  Linkages?: any[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  AttributeValues?: RockAttributeValue[];
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

/** EventItemOccurrence = a specific meeting instance (Legacy model) */
export interface RockEventItemOccurrence {
  Id: number;
  Guid?: string;
  IdKey?: string;
  EventItemId: number;
  CampusId?: number | null;
  ScheduleId?: number | null;
  Location?: string;
  ContactPersonAliasId?: number | null;
  ContactPhone?: string;
  ContactEmail?: string;
  Note?: string;
  NextStartDateTime?: string | null;
  Capacity?: number | null;

  // Expanded relations
  EventItem?: RockEventItem | null;
  Schedule?: any | null;
  Campus?: RockCampus | null;
  ContactPersonAlias?: any | null;
  Linkages?: any[];
  ContentChannelItems?: any[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  AttributeValues?: RockAttributeValue[];
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

/** AttendanceOccurrence = a specific meeting instance linked directly to a Group (New primary model) */
export interface RockAttendanceOccurrence {
  Id: number;
  Guid?: string;
  IdKey?: string;
  GroupId?: number | null;
  LocationId?: number | null;
  ScheduleId?: number | null;
  OccurrenceDate?: string | null;
  DidNotOccur?: boolean | null;
  SundayDate?: string | null;
  Notes?: string | null;
  AnonymousAttendanceCount?: number | null;

  // Expanded
  Schedule?: any | null;
  Group?: any | null;
  Location?: any | null;

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  AttributeValues?: RockAttributeValue[];
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}
