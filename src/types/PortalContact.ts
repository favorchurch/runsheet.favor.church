import { RockGender, RockPerson } from './RockPerson';
import { portalStringId } from './portalStringId';

export interface PortalContact extends RockPerson {
  _id?: string;
  title?: string;
  preferredName?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'male' | 'female';
  dob?: string;
  age?: number;
  phoneNumber?: string;
  created?: string;
  updated?: string;
  status?: 'active' | 'draft' | 'archived' | 'deleted';
  campuses?: string[];
  details?: {
    socialMediaLink?: {
      data?: {
        facebookLink?: string;
      };
    };
  };
  teams?: Array<{
    _id?: string;
    title?: string;
  }>;
}

function genderToString(gender?: number | null): 'male' | 'female' | undefined {
  switch (gender) {
    case RockGender.Male:
      return 'male';
    case RockGender.Female:
      return 'female';
    default:
      return undefined;
  }
}

function getPhoneNumber(person?: Pick<RockPerson, 'PhoneNumbers'>): string {
  return (
    person?.PhoneNumbers?.find((phone) => phone?.NumberFormatted || phone?.Number)?.NumberFormatted ||
    person?.PhoneNumbers?.find((phone) => phone?.NumberFormatted || phone?.Number)?.Number ||
    ''
  );
}

function getAgeFromBirthDate(birthDate?: string | null): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return undefined;
  const diff = Date.now() - dob.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export function normalizePortalContact(person?: Partial<RockPerson> | null): PortalContact {
  const firstName = person?.FirstName || '';
  const lastName = person?.LastName || '';
  const preferredName = person?.NickName || firstName;
  return {
    ...(person as RockPerson),
    _id: portalStringId(person?.Id),
    title: [preferredName, lastName].filter(Boolean).join(' ').trim(),
    preferredName,
    firstName,
    lastName,
    gender: genderToString(person?.Gender),
    dob: person?.BirthDate || undefined,
    age: getAgeFromBirthDate(person?.BirthDate),
    phoneNumber: getPhoneNumber(person as Pick<RockPerson, 'PhoneNumbers'>),
    created: person?.CreatedDateTime || undefined,
    updated: person?.ModifiedDateTime || person?.CreatedDateTime || undefined,
    status: 'active',
    campuses: person?.PrimaryCampusId ? [String(person.PrimaryCampusId)] : [],
  };
}

export function normalizeSearchContactResult(person?: Partial<RockPerson> | null) {
  const contact = normalizePortalContact(person);
  return {
    Id: contact.Id,
    PrimaryAliasId: contact.PrimaryAliasId,
    _id: contact._id || '',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    title: contact.title || '',
    preferredName: contact.preferredName,
    Email: contact.Email,
    Gender: contact.Gender,
    BirthDate: contact.BirthDate,
    PhoneNumbers: contact.PhoneNumbers,
  };
}
