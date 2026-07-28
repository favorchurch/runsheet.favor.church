/**
 * Get next recurring date for connect group as a UTC string
 */
import { RockConnectGroupData } from '@/types/RockGroup';
import { Temporal } from '@js-temporal/polyfill';
import { normalizeMeetupTime } from './normalizeMeetupTime';

type MeetupDay = NonNullable<RockConnectGroupData['meetupDay']>;

export function getNextMeetupUTC(
  startDateUTC: string, // ISO 8601 UTC string
  timezone: string, // IANA timezone, e.g., "Asia/Manila"
  meetupDay: MeetupDay, // Day name
  meetupTime: string // HH:mm format
): string {
  const daysMap: Record<MeetupDay, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  const targetDayNum = daysMap[meetupDay];
  const startInstant = Temporal.Instant.from(startDateUTC);

  // Convert to target timezone
  const zoned = startInstant.toZonedDateTimeISO(timezone);

  // Parse HH:mm
  const normalizedMeetupTime = normalizeMeetupTime(meetupTime);
  if (!normalizedMeetupTime) {
    throw new Error(`Invalid meetupTime: ${meetupTime}`);
  }
  const [hour, minute] = normalizedMeetupTime.split(':').map(Number);

  // Candidate on same day
  let candidate = zoned.with({ hour, minute, second: 0, millisecond: 0 });

  // Loop until we find the correct weekday/time strictly after start
  while (candidate.dayOfWeek % 7 !== targetDayNum || Temporal.ZonedDateTime.compare(candidate, zoned) <= 0) {
    candidate = candidate.add({ days: 1 }).with({ hour, minute, second: 0, millisecond: 0 });
  }

  return candidate.toInstant().toString(); // UTC
}
