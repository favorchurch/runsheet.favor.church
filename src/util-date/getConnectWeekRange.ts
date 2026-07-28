import { getLastSunday } from './getLastSunday';
import { getWeekNumber } from './getWeekNumber';
import { addWeek } from './subtractWeek';

/**
 * Get connect week range based on given date
 */
export function getConnectWeekRange(date: Date, weeks: 1 | 2 = 2) {
  let start: Date = getLastSunday(date);
  if (weeks === 2) {
    const weekNumber = getWeekNumber(start);
    if (weekNumber % 2 === 1) {
      start = addWeek(-1, start);
    }
  }
  const end = addWeek(weeks, start);
  return [start, end];
}

/**
 * Gets the connect week range based on beforeDate / afterDate parameters
 */
export function getConnectWeekRangeParams({
  beforeDate,
  afterDate,
  weeks = 2,
}: {
  beforeDate?: Date | string | null;
  afterDate?: Date | string | null;
  weeks?: 1 | 2;
}) {
  // convert dates
  const currentDate = new Date(afterDate || beforeDate || new Date()); // should be before sunday
  if (afterDate) {
    // move to the connect week after
    currentDate.setDate(currentDate.getDate() + (weeks === 1 ? 7 : 14));
  }
  return getConnectWeekRange(currentDate, weeks);
}
