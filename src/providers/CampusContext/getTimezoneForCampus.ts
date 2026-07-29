import { RockCampusId } from '@/constants/client';

/**
 * IANA timezone for each Favor campus.
 *
 * Rock stores service and signup times without a zone, so anything that formats
 * a campus-local time has to supply one. Campus ids differ between rock-preview
 * and production, which `RockCampusId` already resolves.
 */
const TIMEZONE_BY_CAMPUS_ID: Record<number, string> = {
  [RockCampusId.Global]: 'Asia/Manila',
  [RockCampusId.Manila]: 'Asia/Manila',
  [RockCampusId.Brisbane]: 'Australia/Brisbane',
  [RockCampusId.Seoul]: 'Asia/Seoul',
};

/** Manila is the fallback: it is the home campus and the largest by far. */
export const DEFAULT_CAMPUS_TIMEZONE = 'Asia/Manila';

export function getTimezoneForCampus(campusId: number | null | undefined): string {
  if (campusId == null) return DEFAULT_CAMPUS_TIMEZONE;
  return TIMEZONE_BY_CAMPUS_ID[campusId] ?? DEFAULT_CAMPUS_TIMEZONE;
}
