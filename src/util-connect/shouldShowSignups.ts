import { CampusName, RockCampusId } from '@/constants/client';

export function shouldShowSignups(campusName: string | number | undefined) {
  // return false;
  return (
    campusName === CampusName.Manila ||
    campusName === RockCampusId.Manila ||
    campusName === String(RockCampusId.Manila) ||
    campusName === 'Manila'
  );
}
