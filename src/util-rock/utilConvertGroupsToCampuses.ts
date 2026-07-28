import { RockGroup } from '../types/RockGroup';
import { uniq } from 'lodash';

/**
 * Extract unique campus IDs from a list of Rock groups.
 *
 * Rock campuses are flat integer IDs, so this is just extraction plus
 * de-duplication.
 */
export function rockConvertGroupsToCampuses(groups: RockGroup[]): number[] {
  return uniq(
    groups
      .map((g) => g.CampusId)
      .filter((id): id is number => id !== undefined && id !== null)
  );
}
