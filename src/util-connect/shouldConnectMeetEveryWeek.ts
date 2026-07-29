import { RockGroup } from '@/types/RockGroup';

/**
 * Should connect group meet every week or every other week?
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function shouldConnectMeetEveryWeek(_connectGroup: RockGroup): boolean {
  // return !!connectGroup.campuses?.filter(group => utilFluroStringId(group) === Realm.MNLYouth)?.length;
  return false;
}
