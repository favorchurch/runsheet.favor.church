import { format } from 'date-fns';

type DateParam = Date | string | null;

const fmt = (date: Date) => format(date, 'MMM d');

export function getFormattedDateRange(startDate: DateParam, endDate: DateParam) {
  // format date range based on start & end date
  const s = fmt(startDate ? new Date(startDate) : new Date()).split(' ');
  const e = fmt(endDate ? new Date(endDate) : new Date()).split(' ');
  if (s[0] === e[0]) return `${s[0]} ${s[1]} - ${e[1]}`;
  else return `${s.join(' ')} - ${e.join(' ')}`;
}
