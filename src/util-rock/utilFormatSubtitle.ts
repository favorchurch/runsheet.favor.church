import { RockConnectGroupData, RockGroup, getConnectGroupData } from '../types/RockGroup';
import { convertTo12HourFormat } from '@/util-date/convertTo12HourFormat';
import { getWeeksAgo } from '@/util-date/getWeeksAgo';

/**
 * Format a connect group subtitle from its Rock data.
 *
 * The subtitle is composed from Group Type 25 attributes: location, meetup
 * schedule, demographics, age range, and special identifiers. `NEW!` mirrors
 * the legacy portal behavior for small or recently created groups.
 */
export function rockFormatSubtitle(
  group: RockGroup,
  data?: RockConnectGroupData
): string {
  const groupData = data || getConnectGroupData(group);
  if (!groupData) return '';

  const {
    locality,
    landmark,
    meetupDay,
    meetupTime,
    minAge,
    maxAge,
    groupTypes,
    groupTypesCouples,
    identifiersSpecial,
    ageGroup,
    youthGradeLevel,
    youthHighSchoolLevel,
  } = groupData;

  const parts: string[] = [];

  if (locality) parts.push(locality);
  if (landmark) parts.push(landmark);
  if (meetupDay) parts.push(meetupDay);
  if (meetupTime) parts.push(convertTo12HourFormat(meetupTime));

  const demographics: string[] = [];

  // Parse groupTypes string (Rock stores as comma-separated or single value)
  const groupTypesArr = groupTypes?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  const groupTypesCouplesArr = groupTypesCouples?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  const identifiersArr = identifiersSpecial?.split(',').map((s) => s.trim()).filter(Boolean) || [];

  if (ageGroup?.toLowerCase() === 'youth' && youthHighSchoolLevel && youthGradeLevel) {
    demographics.push(`${youthHighSchoolLevel} – ${youthGradeLevel}`);
    if (groupTypesArr.includes('Men Only')) demographics.push('Boys');
    if (groupTypesArr.includes('Women Only')) demographics.push('Girls');
    demographics.push(
      ...groupTypesArr.filter((type) => type !== 'Men Only' && type !== 'Women Only')
    );
  } else if (groupTypesArr.length) {
    demographics.push(...groupTypesArr);
  }

  if (groupTypesArr.includes('Couples') && groupTypesCouplesArr.length) {
    demographics.push(`(${groupTypesCouplesArr.join(', ')})`);
  }

  let ageStr = '';
  if (minAge !== undefined) {
    ageStr = maxAge !== undefined ? `(${minAge}-${maxAge})` : `(${minAge}+)`;
  }

  if (demographics.length || ageStr) {
    parts.push([demographics.join(' '), ageStr].filter(Boolean).join(' '));
  }

  if (identifiersArr.length) {
    parts.push(...identifiersArr);
  }

  // Rock Groups use Members count instead of provisionalMembers
  const memberCount = group.Members?.length || 0;
  const isNew = memberCount < 4 || (group.CreatedDateTime && getWeeksAgo(new Date(group.CreatedDateTime), new Date()) < 4);

  return (isNew ? 'NEW! ' : '') + parts.join(' // ');
}
