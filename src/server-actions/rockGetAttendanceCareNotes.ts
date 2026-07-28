'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { number, object } from 'zod';

const schema = object({
  eventId: number().int().positive(),
});

/**
 * Get care notes for a specific attendance occurrence.
 * @param eventId The Rock AttendanceOccurrence ID
 * @returns Promise resolving to the care notes content
 */
export async function rockGetAttendanceCareNotes(eventId: number): Promise<string | null> {
  await assertAuthenticated();
  schema.parse({ eventId });

  try {
    const occurrence = await rockGet(`/AttendanceOccurrences/${eventId}`, {
      $select: 'Notes',
    });

    if (!occurrence) {
      return null;
    }

    return occurrence.Notes || null;
  } catch (error) {
    console.error('Error fetching care notes from Rock:', error);
    throw error;
  }
}
