export const convertTo12HourFormat = (time24: string): string => {
  const timeFormat = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const match = time24.match(timeFormat);

  if (!match) {
    return '';
  }

  const [hoursStr, minutesStr] = time24.split(':');
  let hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const period = hours < 12 ? 'AM' : 'PM';

  hours = hours % 12 || 12;

  return minutes === 0
    ? `${hours}${period}`
    : `${hours}:${minutes.toString().padStart(2, '0')}${period}`;
};
