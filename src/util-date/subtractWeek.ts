/**
 * Get new date minus week number
 */

export function addWeek(weeks: number, date: Date) {
   const nd = new Date(date);
   nd.setDate(nd.getDate() + (weeks * 7));
   return nd;
}
