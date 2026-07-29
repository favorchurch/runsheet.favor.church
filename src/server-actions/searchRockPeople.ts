'use server';

import { rockGet } from '@/server-actions/internal/rockFetch';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 15;

export interface RockPersonSearchResult {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email?: string;
}

/** Escapes a value for use inside an OData string literal. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Looks up people in Rock for the runsheet's Person-backed columns.
 *
 * Tries Rock's own `/People/Search` first (it handles nicknames and partial
 * names), then falls back to an OData `substringof` query on first/last name.
 */
export async function searchRockPeople(query: string): Promise<RockPersonSearchResult[]> {
  const trimmed = query?.trim() ?? '';
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  try {
    const searchResults = (await rockGet('/People/Search', { name: trimmed }, true)) as any[];

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      return searchResults.slice(0, MAX_RESULTS).map((person) => ({
        id: person.Id || person.PersonId || person.id,
        name: person.Name || `${person.FirstName || ''} ${person.LastName || ''}`.trim(),
        firstName: person.FirstName || '',
        lastName: person.LastName || '',
        email: person.Email || person.email || '',
      }));
    }
  } catch (err) {
    console.warn('Rock /People/Search failed, falling back to OData:', err);
  }

  try {
    const escaped = escapeODataString(trimmed);
    const odataResults = (await rockGet(
      '/People',
      {
        $filter: `substringof('${escaped}', FirstName) or substringof('${escaped}', LastName)`,
        $select: 'Id,FirstName,LastName,Email',
        $top: MAX_RESULTS,
        $orderby: 'Id',
      },
      true,
    )) as any[];

    if (Array.isArray(odataResults)) {
      return odataResults.map((person) => ({
        id: person.Id,
        name: `${person.FirstName || ''} ${person.LastName || ''}`.trim(),
        firstName: person.FirstName || '',
        lastName: person.LastName || '',
        email: person.Email,
      }));
    }
  } catch (err) {
    console.error('Error searching Rock people:', err);
  }

  return [];
}
