'use server';

export interface RockPersonSearchResult {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export async function searchRockPeople(query: string): Promise<RockPersonSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const rockUrl = process.env.ROCK_API_URL || 'https://rock.favor.church/api';
  const rockKey = process.env.ROCK_API_KEY || 'IULFJIYTsYHPd8x28Jwi0H21';

  try {
    // 1. Try Rock's native /People/Search?name=... endpoint
    const searchUrl = `${rockUrl}/People/Search?name=${encodeURIComponent(query.trim())}`;
    const res = await fetch(searchUrl, {
      headers: {
        'Authorization-Token': rockKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, 15).map((p: any) => ({
          id: p.Id || p.PersonId || p.id,
          name: p.Name || `${p.FirstName || ''} ${p.LastName || ''}`.trim(),
          firstName: p.FirstName || '',
          lastName: p.LastName || '',
          email: p.Email || p.email || '',
        }));
      }
    }

    // 2. Fallback: OData search on People table
    const odataUrl = `${rockUrl}/People?$filter=substringof('${encodeURIComponent(query.trim())}', FirstName) or substringof('${encodeURIComponent(query.trim())}', LastName)&$select=Id,FirstName,LastName,Email&$top=15&$orderby=Id`;
    const odataRes = await fetch(odataUrl, {
      headers: {
        'Authorization-Token': rockKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (odataRes.ok) {
      const odataData = await odataRes.json();
      if (Array.isArray(odataData)) {
        return odataData.map((p: any) => ({
          id: p.Id,
          name: `${p.FirstName} ${p.LastName}`.trim(),
          firstName: p.FirstName,
          lastName: p.LastName,
          email: p.Email,
        }));
      }
    }
  } catch (err) {
    console.error('Error searching Rock people:', err);
  }

  return [];
}
