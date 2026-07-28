
export function getWeeksAgo(startDate: Date | string, endDate: Date | string) {
   const msInWeek = 1000 * 60 * 60 * 24 * 7;
   return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / msInWeek);
}
