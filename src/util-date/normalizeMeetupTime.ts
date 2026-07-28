export function normalizeMeetupTime(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;

  const twentyFourHour = value.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  const compact = value.match(/^(\d{1,2})([0-5]\d)$/);
  if (compact) {
    const hours = Number(compact[1]);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:${compact[2]}`;
    }
  }

  const meridian = value.match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?$/i);
  if (meridian) {
    let hours = Number(meridian[1]);
    const minutes = meridian[2] || '00';
    if (hours < 1 || hours > 12) return undefined;
    const isPm = meridian[3].toLowerCase() === 'p';
    if (hours === 12) {
      hours = isPm ? 12 : 0;
    } else if (isPm) {
      hours += 12;
    }
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return undefined;
}
