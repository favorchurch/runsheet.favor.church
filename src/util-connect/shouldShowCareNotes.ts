import { CampusName, RockCampusId } from '@/constants/client';

export function shouldShowCareNotes(campusName: string | undefined) {
  return (
    campusName === CampusName.Manila ||
    campusName === CampusName.Brisbane ||
    campusName === 'Manila' ||
    campusName === 'Brisbane' ||
    campusName === String(RockCampusId.Manila) ||
    campusName === String(RockCampusId.Brisbane)
  );
}
