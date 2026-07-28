/**
 * Rock Group type.
 * Maps from PortalGroupTeam + FluroConnectGroup.
 *
 * Key differences:
 * - Id is integer (not hex string)
 * - 'Name' instead of 'title'
 * - 'IsActive' boolean instead of 'status' string
 * - Members accessed via $expand (separate GroupMember records)
 * - AttributeValues used for connect group data (capacity, age, meetup info)
 */

import {
  CONNECT_GROUP_ATTRIBUTE_KEYS,
  CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY,
  parseAgeRangeValue,
  inferAgeGroupFromRange,
  normalizeConnectAgeGroup,
} from '@/connectGroupAttributes';
import { normalizeMeetupTime } from '@/util-date/normalizeMeetupTime';
import { RockGroupMember } from './RockGroupMember';
import { RockCampus } from './RockCampus';
import { RockAttributeValue } from './RockAttributeValue';

/** Connect group data stored as AttributeValues on the Rock Group */
export interface RockConnectGroupData {
  capacity?: number;
  minAge?: number;
  maxAge?: number;
  locality?: string;
  landmark?: string;
  meetupDay?: string; // 'Sunday', 'Monday', etc.
  meetupTime?: string; // '19:00' for 7:00 PM
  ageGroup?: string;
  groupTypes?: string;
  groupTypesCouples?: string;
  youthHighSchoolLevel?: string;
  youthGradeLevel?: string;
  youngAdultsIsForCampus?: string;
  youngAdultsWhichCampus?: string;
  identifiersSpecial?: string;
  collectingMembers?: boolean;
}

export interface RockGroup {
  Id: number;
  Guid?: string;
  IdKey?: string;
  Name?: string;
  Description?: string;
  IsActive?: boolean;
  GroupTypeId?: number; // 23=Ministry Team, 24=Section, 25=Connect Group, 37=Sign-Up
  CampusId?: number;
  ScheduleId?: number | null;
  ParentGroupId?: number | null;
  GroupCapacity?: number | null;
  IsPublic?: boolean;
  IsArchived?: boolean;
  ArchivedDateTime?: string | null;
  StatusValueId?: number | null;
  Order?: number;
  GroupSalutation?: string | null;
  IsSpecialNeeds?: boolean;

  // Expanded relations
  Members?: RockGroupMember[];
  GroupType?: any | null;
  Campus?: RockCampus | null;
  Schedule?: any | null;
  AttributeValues?: RockAttributeValue[];
  GroupLocations?: any[];
  GroupRequirements?: any[];

  // Metadata
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  CreatedByPersonAliasId?: number | null;
  ModifiedByPersonAliasId?: number | null;
  ModifiedAuditValuesAlreadyUpdated?: boolean;
  Attributes?: any;
  ForeignId?: string | null;
  ForeignGuid?: string | null;
  ForeignKey?: string | null;
}

/** GroupType IDs for known types */
export enum RockGroupType {
  SecurityRole = 1,
  Family = 10,
  KnownRelationship = 11,
  WeeklyServiceCheckin = 14,
  MinistryTeams = 23,
  ConnectGroupSection = 24,
  ConnectGroup = 25,
  GeneralGroup = 26,
  ApplicationGroup = 27,
  OrganizationUnit = 28,
  SignUpGroup = 37,
  Baptism = 38,
}

/** Helper to extract connect group data from attribute values */
export function getConnectGroupData(group: RockGroup): RockConnectGroupData | undefined {
  if (!group.AttributeValues) return undefined;

  let attributes: { AttributeName?: string; AttributeKey?: string; Value?: string }[] = [];

  if (Array.isArray(group.AttributeValues)) {
    attributes = group.AttributeValues;
  } else if (typeof group.AttributeValues === 'object') {
    attributes = Object.entries(group.AttributeValues).map(([key, attr]) => ({
      AttributeKey: key,
      Value: (attr as any).Value,
    }));
  }

  if (attributes.length === 0) return undefined;

  const data: RockConnectGroupData = {};
  for (const attr of attributes) {
    const nameKey = attr.AttributeName?.replace(/^Connect /, '').replace(/^Group /, '');
    const key = attr.AttributeKey || nameKey;
    if (!key) continue;
    const value = attr.Value;
    switch (key) {
      case CONNECT_GROUP_ATTRIBUTE_KEYS.ageGroup:
        data.ageGroup = normalizeConnectAgeGroup(value) || value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.ageRange: {
        const ageRange = parseAgeRangeValue(value);
        data.minAge = ageRange.minAge;
        data.maxAge = ageRange.maxAge;
        break;
      }
      case CONNECT_GROUP_ATTRIBUTE_KEYS.locality:
        data.locality = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.landmark:
        data.landmark = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.meetupDay:
        data.meetupDay = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.meetupTime:
        data.meetupTime = normalizeMeetupTime(value);
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypes:
        data.groupTypes = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypesCouples:
        data.groupTypesCouples = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.specialIdentifiers:
        data.identifiersSpecial = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.youthHighSchoolLevel:
        data.youthHighSchoolLevel = value || undefined;
        break;
      case CONNECT_GROUP_ATTRIBUTE_KEYS.youthGradeLevel:
        data.youthGradeLevel = value || undefined;
        break;
      case CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY:
        data.collectingMembers = value === 'True';
        break;
      case 'Capacity': data.capacity = value ? Number(value) : undefined; break;
      case 'Min Age': data.minAge = value ? Number(value) : undefined; break;
      case 'Max Age': data.maxAge = value ? Number(value) : undefined; break;
      case 'Locality': data.locality = value || undefined; break;
      case 'Landmark': data.landmark = value || undefined; break;
      case 'Meetup Day': data.meetupDay = value || undefined; break;
      case 'Meetup Time': data.meetupTime = normalizeMeetupTime(value); break;
      case 'Age Group': data.ageGroup = value || undefined; break;
      case 'Group Types': data.groupTypes = value || undefined; break;
      case 'Group Types (Couples)': data.groupTypesCouples = value || undefined; break;
      case 'Youth High School Level': data.youthHighSchoolLevel = value || undefined; break;
      case 'Youth Grade Level': data.youthGradeLevel = value || undefined; break;
      case 'Young Adults Is For Campus': data.youngAdultsIsForCampus = value || undefined; break;
      case 'Young Adults Which Campus': data.youngAdultsWhichCampus = value || undefined; break;
      case 'Identifiers (Special)': data.identifiersSpecial = value || undefined; break;
    }
  }
  if (!data.ageGroup) {
    data.ageGroup = inferAgeGroupFromRange(data.minAge, data.maxAge);
  }
  return data;
}
