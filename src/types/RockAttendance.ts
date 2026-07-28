/**
 * Rock Attendance type.
 * Maps from FluroCheckin.
 *
 * Key differences:
 * - References OccurrenceId (int) instead of event (hex string)
 * - References PersonAliasId (int) instead of contact (hex string)
 * - DidAttend is boolean
 * - CheckInStatus: 2=present
 * - No denormalized firstName/lastName (join via Person)
 */

export interface RockAttendance {
  Id: number;
  Guid?: string;
  IdKey?: string;
  OccurrenceId: number;
  PersonAliasId: number;
  CampusId?: number;
  StartDateTime?: string;
  EndDateTime?: string | null;
  DidAttend?: boolean;
  Note?: string | null;
  RSVP?: number; // 3=confirmed
  CheckInStatus?: number; // 2=present, 3=checked out
  PresentDateTime?: string | null;
  PresentByPersonAliasId?: number | null;
  ScheduledToAttend?: boolean | null;
  SourceValueId?: number | null;
  QualifierValueId?: number | null;
  DeviceId?: number | null;
  SearchTypeValueId?: number | null;
  SearchValue?: string | null;
  CheckedInByPersonAliasId?: number | null;
  CheckedOutByPersonAliasId?: number | null;
  AttendanceCodeId?: number | null;
  IsFirstTime?: boolean | null;
  Processed?: boolean | null;
  ScheduledByPersonAliasId?: number | null;
  ScheduleConfirmationSent?: boolean | null;
  ScheduleReminderSent?: boolean | null;
  RSVPDateTime?: string | null;
  DeclineReasonValueId?: number | null;

  // Expanded relations
  Device?: any | null;
  SearchTypeValue?: any | null;
  AttendanceCode?: any | null;
  Qualifier?: any | null;
  DeclineReasonValue?: any | null;
  ScheduledByPersonAlias?: any | null;
  PresentByPersonAlias?: any | null;
  CheckedOutByPersonAlias?: any | null;
  SourceValue?: any | null;

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

/** CheckIn Status enum */
export enum RockCheckInStatus {
  None = 0,
  Present = 2,
  CheckedOut = 3,
}
