import { string } from 'zod';

export function utcDate() {
  return string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
      'Must be a UTC ISO date string (e.g. 2025-08-16T16:00:00.000Z)'
    )
    .refine((val) => !isNaN(Date.parse(val)), 'Must be a valid UTC date')
    .transform((val) => new Date(val));
}
