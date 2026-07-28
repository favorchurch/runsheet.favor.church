import 'server-only';

import { ROCK_API_URL, ROCK_API_KEY, ROCK_FETCH_REVALIDATE_SECONDS } from '@/constants.server';
import { readRockObjectCache, writeRockObjectCache } from '@/server-actions/internal/rockObjectCache';
import { AuthAccess, AuthContact, AuthRolesMap } from '@/types/AuthUser';

const ROCK_RECORD_STATUS_ACTIVE = 3;

export class NoRockPersonError extends Error {
  constructor() {
    super('NO_ROCK_PERSON');
    this.name = 'NoRockPersonError';
  }
}

export class CloudflareBlockError extends Error {
  constructor(path: string) {
    super(`Cloudflare blocked the Rock API request for ${path}.`);
    this.name = 'CloudflareBlockError';
  }
}

function isCloudflareChallenge(response: Response, text: string): boolean {
  if (response.status !== 403) return false;
  const server = response.headers.get('server') || '';
  return (
    server.toLowerCase().includes('cloudflare') ||
    text.includes('Just a moment...') ||
    text.includes('__cf_chl') ||
    text.includes('Enable JavaScript and cookies to continue')
  );
}

async function rawRockGet(path: string, params?: Record<string, string | number | boolean>): Promise<any> {
  const cached = await readRockObjectCache(path, 'GET', params);
  if (cached.hit) {
    return cached.value;
  }

  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
  }
  const queryString = searchParams.toString();
  const fullUrl = `${ROCK_API_URL}${path}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Authorization-Token': ROCK_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'RockRoster/1.0',
    },
    next: {
      revalidate: ROCK_FETCH_REVALIDATE_SECONDS,
      tags: ['rock'],
    },
  });

  const text = await response.text();

  if (!response.ok) {
    if (isCloudflareChallenge(response, text)) {
      throw new CloudflareBlockError(path);
    }
    throw new Error(`Rock API error ${response.status}: ${text}`);
  }

  if (!text || text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text);
    await writeRockObjectCache(path, 'GET', params, parsed);
    return parsed;
  } catch {
    await writeRockObjectCache(path, 'GET', params, text);
    return text;
  }
}

async function fetchPersonById(personId: number) {
  const people = await rawRockGet('/People', {
    $filter: `Id eq ${personId} and RecordStatusValueId eq ${ROCK_RECORD_STATUS_ACTIVE} and IsDeceased eq false`,
    $select: 'Id,FirstName,LastName,NickName,Email,PrimaryCampusId,PrimaryAliasId,RecordStatusValueId',
    $top: 1,
  });

  return (Array.isArray(people) && people.length > 0 ? people[0] : null) as any | null;
}

export interface ResolveResult {
  contact: AuthContact;
  rolesMap: AuthRolesMap;
  access: AuthAccess;
}

export async function rockResolveAccess(personId: number): Promise<ResolveResult> {
  const person = await fetchPersonById(personId);
  if (!person) {
    throw new NoRockPersonError();
  }

  const contact: AuthContact = {
    id: Number(person.Id),
    primaryAliasId: person.PrimaryAliasId != null ? Number(person.PrimaryAliasId) : undefined,
    firstName: person.FirstName || '',
    lastName: person.LastName || '',
    nickName: person.NickName || '',
    fullName:
      person.FullName ||
      [person.NickName || person.FirstName || '', person.LastName || '']
        .filter(Boolean)
        .join(' ')
        .trim(),
    email: person.Email || '',
    campusId: person.PrimaryCampusId != null ? Number(person.PrimaryCampusId) : null,
  };

  const campusIds = person.PrimaryCampusId != null ? [Number(person.PrimaryCampusId)] : [];

  return { contact, rolesMap: {}, access: { campusIds } };
}
