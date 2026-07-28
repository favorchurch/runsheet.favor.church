import { getWeeksAgo } from './getWeeksAgo';


export function getWeeksAgoReadable(startDate: Date | string, endDate: Date | string) {
   const weeks = getWeeksAgo(startDate, endDate);
   if (weeks < 0) return `${-weeks} week${weeks === -1 ? '' : 's'} ago`;
   if (weeks > 0) return `${weeks} week${weeks === 1 ? '' : 's'} from now`;
   return 'this week';
}
