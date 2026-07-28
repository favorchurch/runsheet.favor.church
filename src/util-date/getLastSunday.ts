/**
 * Gets the previous connect week Sunday at 00:00:00.
 */
export function getLastSunday(date: Date) {
  const lastSunday = new Date(date);
  lastSunday.setHours(0, 0, 0, 0);

  // If it's Sunday today, we go back to the previous Sunday
  // If it's any other day, we go to the Sunday of the current week
  const day = lastSunday.getDay();
  const diff = day === 0 ? 7 : day;
  lastSunday.setDate(lastSunday.getDate() - diff);

  return lastSunday;
}
