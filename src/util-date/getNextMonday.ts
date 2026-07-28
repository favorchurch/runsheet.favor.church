import { getLastSunday } from './getLastSunday';

/**
* Gets the next connect week Monday.
*/

export function getNextMonday(date: Date) {
   const nextMonday = new Date(getLastSunday(date));
   nextMonday.setDate(nextMonday.getDate() + 8);
   return nextMonday;
}
