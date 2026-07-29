'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { ROCK_API_URL, ROCK_API_KEY } from '@/constants/server';
import { number, object } from 'zod';

const schema = object({
  personId: number().int().positive(),
});

/**
 * Get avatar URL for a person.
 * Replaces fluroGetAvatarByContactId.
 *
 * Rock serves photos via /People/{id}/GetPhotoUrl or via the PhotoUrl field.
 * If no photo is found, returns a placeholder URL.
 */
export async function rockGetAvatarByContactId(personId: number): Promise<string> {
  await assertAuthenticated();
  schema.parse({ personId });

  try {
    const response = await fetch(
      `${ROCK_API_URL}/People/${personId}?$select=PhotoUrl,PhotoId,Id,FirstName,LastName`,
      {
        headers: {
          'Authorization-Token': ROCK_API_KEY,
          Accept: 'application/json',
        },
        next: { revalidate: 3600, tags: ['rock'] },
      }
    );

    if (!response.ok) return '';
    const person = await response.json();
    const rawPhotoUrl = person?.PhotoUrl;
    const photoId = person?.PhotoId;

    if (rawPhotoUrl) {
      return rawPhotoUrl.startsWith('http')
        ? rawPhotoUrl
        : `${new URL(ROCK_API_URL).origin}${rawPhotoUrl.startsWith('/') ? '' : '/'}${rawPhotoUrl}`;
    }

    if (photoId) {
      return `${new URL(ROCK_API_URL).origin}/GetImage.ashx?id=${photoId}`;
    }

    // Default placeholder
    const initials = `${person?.FirstName?.[0] || ''}${person?.LastName?.[0] || ''}`.toUpperCase() || '??';
    return `${new URL(ROCK_API_URL).origin}/GetAvatar.ashx?PhotoId=&AgeClassification=Adult&Gender=Unknown&RecordTypeId=1&Text=${initials}&Size=400&Style=icon&BackgroundColor=E4E4E7&ForegroundColor=A1A1AA`;
  } catch {
    return '';
  }
}
