import 'server-only';

import { ROCK_CONTENT_TYPE_ID } from '@/constants/server';
import { rockGet } from './rockFetch';

let cachedNumericId: number | null = null;

export async function rockResolveContentChannelTypeId(): Promise<number> {
  if (cachedNumericId !== null) {
    return cachedNumericId;
  }

  if (!ROCK_CONTENT_TYPE_ID) {
    throw new Error('ROCK_CONTENT_TYPE_ID environment variable is not set');
  }

  const types = (await rockGet('/ContentChannelTypes')) as Array<{
    Id: number;
    IdKey: string;
  }>;

  const matchedType = types.find((t) => t.IdKey === ROCK_CONTENT_TYPE_ID);

  if (!matchedType) {
    throw new Error(`Content Channel Type with IdKey "${ROCK_CONTENT_TYPE_ID}" not found in Rock`);
  }

  cachedNumericId = matchedType.Id;
  return cachedNumericId;
}
