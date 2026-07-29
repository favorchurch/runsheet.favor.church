import { RockCampusId } from '@/constants/client';

export type ConnectAgeGroup = 'Adults' | 'Seasoned' | 'Young Adults' | 'Youth' | 'Kids';
export type ConnectAttributeFieldType = 'text' | 'integer' | 'single-select' | 'multi-select' | 'boolean';

export interface ConnectGroupAttributeSpec {
  key: string;
  title: string;
  fieldType: ConnectAttributeFieldType;
  order: number;
  required?: boolean;
  options?: string[];
}

export interface ConnectAgeRangeDefault {
  minAge?: number;
  maxAge?: number;
}

export const CONNECT_GROUP_ATTRIBUTE_KEYS = {
  ageGroup: 'ConnectAgeGroup',
  ageRange: 'AgeRange',
  locality: 'CityMunicipalityLocality',
  landmark: 'AreaBuildingLandmark',
  meetupDay: 'ConnectMeetupDay',
  meetupTime: 'ConnectMeetupTime',
  groupTypes: 'GroupType1',
  groupTypesCouples: 'ConnectGroupTypesCouples',
  specialIdentifiers: 'SpecialIdentifiers',
  youthHighSchoolLevel: 'ConnectYouthHighSchoolLevel',
  youthGradeLevel: 'ConnectYouthGradeLevel',
} as const;

/** Behavioral flag indicating group is actively collecting members (not yet running events).
 *  Kept separate from CONNECT_GROUP_ATTRIBUTE_KEYS to avoid coupling with
 *  rockRequireConnectGroupAttributeDefinitions, which would fail until provisioned everywhere. */
export const CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY = 'ConnectCollectingMembers';

export const CONNECT_AGE_GROUP_OPTIONS: ConnectAgeGroup[] = [
  'Adults',
  'Seasoned',
  'Young Adults',
  'Youth',
  'Kids',
];

export const CONNECT_AGE_GROUP_DEFAULTS: Record<ConnectAgeGroup, ConnectAgeRangeDefault> = {
  Adults: { minAge: 26, maxAge: 49 },
  Seasoned: { minAge: 50 },
  'Young Adults': { minAge: 18, maxAge: 25 },
  Youth: { minAge: 13, maxAge: 17 },
  Kids: { minAge: 1, maxAge: 12 },
};

export const CONNECT_GROUP_TYPE_OPTIONS = [
  'Men & Women',
  'Couples',
  'College Students',
  'Men Only',
  'Women Only',
  'Single',
  'Single Moms',
] as const;

export const CONNECT_GROUP_TYPES_COUPLES_OPTIONS = [
  'Dating',
  'Engaged',
  'Married',
  'With Kids',
] as const;

export const CONNECT_SPECIAL_IDENTIFIER_OPTIONS = [
  'CIW',
  'Deaf',
  'Youth Leaders',
  'Kids Leaders',
] as const;

export const CONNECT_YOUTH_LEVEL_OPTIONS = ['Junior High', 'Senior High'] as const;

export const CONNECT_MEETUP_DAY_OPTIONS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const CONNECT_CAMPUS_OPTIONS = ['Manila', 'Brisbane', 'Seoul'] as const;

export const MANILA_LOCALITY_OPTIONS = [
  'Ortigas Center',
  'Antipolo',
  'Bacolod',
  'Binangonan',
  'Bulacan',
  'Cainta',
  'Cavite',
  'Caloocan',
  'La Union',
  'Laguna',
  'Las Piñas',
  'Makati',
  'Malabon',
  'Mandaluyong',
  'Manila',
  'Marikina',
  'Muntinlupa',
  'Navotas',
  'Nueva Ecija',
  'Pampanga',
  'Parañaque',
  'Pasay',
  'Pasig',
  'Quezon City',
  'San Juan',
  'San Mateo',
  'Taguig',
  'Taytay',
  'Valenzuela',
  'Others',
] as const;

export const MANILA_LOCALITY_DESCRIPTION =
  'Choose "Ortigas Center" for Shangri-La, Megamall, Podium, Metrotent, Estancia.';

export const LANDMARK_DESCRIPTION =
  'Specific building or generic landmark to locate your Connect Group.';

export const CONNECT_CAPACITY_OPTIONS = ['CLOSED', ...Array.from({ length: 30 }, (_, index) => String(index + 1))];

export const CONNECT_CAPACITY_DEFAULT = '12';

export const CONNECT_GROUP_ATTRIBUTE_SPECS: ConnectGroupAttributeSpec[] = [
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.ageGroup,
    title: 'Age Group',
    fieldType: 'single-select',
    required: true,
    options: [...CONNECT_AGE_GROUP_OPTIONS],
    order: 0,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.ageRange,
    title: 'Age Range',
    fieldType: 'text',
    required: true,
    order: 1,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.locality,
    title: 'City / Municipality / Locality',
    fieldType: 'text',
    required: true,
    order: 2,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.landmark,
    title: 'Area / Building / Landmark',
    fieldType: 'text',
    required: true,
    order: 3,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.meetupDay,
    title: 'Meet-up Day',
    fieldType: 'single-select',
    required: true,
    options: [...CONNECT_MEETUP_DAY_OPTIONS],
    order: 4,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.meetupTime,
    title: 'Meet-up Time',
    fieldType: 'text',
    required: true,
    order: 5,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypes,
    title: 'Group Types',
    fieldType: 'multi-select',
    required: true,
    options: [...CONNECT_GROUP_TYPE_OPTIONS],
    order: 6,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.groupTypesCouples,
    title: 'Couples Stage',
    fieldType: 'multi-select',
    options: [...CONNECT_GROUP_TYPES_COUPLES_OPTIONS],
    order: 7,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.specialIdentifiers,
    title: 'Special Identifiers',
    fieldType: 'multi-select',
    options: [...CONNECT_SPECIAL_IDENTIFIER_OPTIONS],
    order: 8,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.youthHighSchoolLevel,
    title: 'Youth Level',
    fieldType: 'single-select',
    options: [...CONNECT_YOUTH_LEVEL_OPTIONS],
    order: 9,
  },
  {
    key: CONNECT_GROUP_ATTRIBUTE_KEYS.youthGradeLevel,
    title: 'Grade Level',
    fieldType: 'text',
    order: 10,
  },
];

/**
 * Standalone boolean attribute for Connect Groups (not part of CONNECT_GROUP_ATTRIBUTE_SPECS).
 * Provisioned separately to avoid coupling with rockRequireConnectGroupAttributeDefinitions.
 */
export const CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_SPEC: ConnectGroupAttributeSpec = {
  key: CONNECT_COLLECTING_MEMBERS_ATTRIBUTE_KEY,
  title: 'Collecting Members',
  fieldType: 'boolean',
  order: 11,
};

const LEGACY_AGE_GROUP_MAP: Record<string, ConnectAgeGroup> = {
  ADULTS: 'Adults',
  Adults: 'Adults',
  adults: 'Adults',
  SEASONED: 'Seasoned',
  Seasoned: 'Seasoned',
  seasoned: 'Seasoned',
  'YOUNG ADULTS': 'Young Adults',
  YoungAdults: 'Young Adults',
  'Young Adults': 'Young Adults',
  'young adults': 'Young Adults',
  YOUTH: 'Youth',
  Youth: 'Youth',
  youth: 'Youth',
  KIDS: 'Kids',
  Kids: 'Kids',
  kids: 'Kids',
};

export const CAMPUS_NAME_BY_ID: Record<number, (typeof CONNECT_CAMPUS_OPTIONS)[number]> = {
  [RockCampusId.Manila]: 'Manila',
  [RockCampusId.Brisbane]: 'Brisbane',
  [RockCampusId.Seoul]: 'Seoul',
};

export const CAMPUS_ID_BY_NAME: Record<(typeof CONNECT_CAMPUS_OPTIONS)[number], number> = {
  Manila: RockCampusId.Manila,
  Brisbane: RockCampusId.Brisbane,
  Seoul: RockCampusId.Seoul,
};

export function normalizeConnectAgeGroup(value?: string | null): ConnectAgeGroup | undefined {
  if (!value) return undefined;
  return LEGACY_AGE_GROUP_MAP[value] || LEGACY_AGE_GROUP_MAP[value.trim()];
}

export function getAgeDefaultsForGroup(value?: string | null): ConnectAgeRangeDefault | undefined {
  const normalized = normalizeConnectAgeGroup(value);
  return normalized ? CONNECT_AGE_GROUP_DEFAULTS[normalized] : undefined;
}

export function inferAgeGroupFromRange(minAge?: number, maxAge?: number): ConnectAgeGroup | undefined {
  for (const [ageGroup, defaults] of Object.entries(CONNECT_AGE_GROUP_DEFAULTS) as Array<
    [ConnectAgeGroup, ConnectAgeRangeDefault]
  >) {
    if (defaults.minAge !== minAge) continue;
    if ((defaults.maxAge ?? null) === (maxAge ?? null)) {
      return ageGroup;
    }
  }
  return undefined;
}

export function parseAgeRangeValue(value?: string | null): ConnectAgeRangeDefault {
  if (!value) return {};
  const [minRaw, maxRaw] = value.split(',').map((part) => {
    const trimmed = part.trim();
    return trimmed === '' ? NaN : Number(trimmed);
  });
  return {
    minAge: Number.isFinite(minRaw) ? minRaw : undefined,
    maxAge: Number.isFinite(maxRaw) ? maxRaw : undefined,
  };
}

export function formatAgeRangeValue(minAge?: number, maxAge?: number): string | undefined {
  if (minAge === undefined || minAge === null || Number.isNaN(minAge)) return undefined;
  if (maxAge === undefined || maxAge === null || Number.isNaN(maxAge)) {
    return `${minAge},`;
  }
  return `${minAge},${maxAge}`;
}

export function splitDelimitedValues(value?: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinDelimitedValues(values?: string[] | string | null): string | undefined {
  const parts = splitDelimitedValues(values);
  return parts.length ? parts.join(', ') : undefined;
}

export function buildConnectAttributeOptionQualifierValue(options?: readonly string[]): string | undefined {
  if (!options?.length) return undefined;
  return options.map((option) => `${option}^${option}`).join(',');
}

export function normalizeCapacityValue(
  capacity?: string | number | null
): string | undefined {
  if (capacity === null || capacity === undefined || capacity === '') return 'CLOSED';
  if (typeof capacity === 'number') {
    if (!Number.isFinite(capacity) || capacity <= 0) return 'CLOSED';
    return String(capacity);
  }
  if (String(capacity).toUpperCase() === 'CLOSED') return 'CLOSED';
  const numeric = Number(capacity);
  if (Number.isFinite(numeric) && numeric > 0) return String(numeric);
  return 'CLOSED';
}

export function capacityToRockValue(capacity?: string | number | null): number | null | undefined {
  if (capacity === undefined) return undefined;
  const normalized = normalizeCapacityValue(capacity);
  if (!normalized || normalized === 'CLOSED') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
