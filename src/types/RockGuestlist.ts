/**
 * Rock Guestlist type.
 * Composite type for event guestlist -- merges GroupMember data with Attendance records.
 * Maps from FluroEventGuestlistItem.
 *
 * Built by joining:
 * 1. GroupMembers for the connect group
 * 2. Attendance records for the occurrence
 */

import { ConnectRole } from './ConnectRole';
import { RockPerson } from './RockPerson';

export interface RockGuestlistItem extends RockPerson {
  attendance?: {
    checkin?: boolean;
    guestExpected?: boolean;
    removed?: boolean;
  };
  roles?: ConnectRole[];
  /** The attendance record ID if checked in */
  attendanceId?: number;
  /** The group member record ID */
  groupMemberId?: number;
  /** The group member's role name from Rock */
  groupRoleName?: string;
}
