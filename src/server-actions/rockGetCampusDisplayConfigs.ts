import 'server-only';

import {
  type CampusDisplayConfig,
  mergeOverDefaults,
} from '@/lib/connectSignupsDisplayConfig';
import { rockGetPublic } from '@/server-actions/internal/rockFetch';

const CACHE_TTL_MS = 60_000;
const ATTRIBUTE_KEY = 'ConnectSignupsDisplayConfig';

let cachedConfigs: { expiresAt: number; value: Record<string, CampusDisplayConfig> } | null = null;

interface CampusAttributeValue {
  Value?: unknown;
}

interface CampusWithAttributes {
  ShortCode?: string | null;
  AttributeValues?: Record<string, CampusAttributeValue | undefined>;
}

function rawConfigForCampus(campus: CampusWithAttributes): unknown {
  return campus.AttributeValues?.[ATTRIBUTE_KEY]?.Value;
}

/** Read all active campus display configurations for the public signups app. */
export async function rockGetCampusDisplayConfigs(): Promise<
  Record<string, CampusDisplayConfig>
> {
  if (cachedConfigs && cachedConfigs.expiresAt > Date.now()) {
    return cachedConfigs.value;
  }

  // Unauthenticated on purpose: this module is `server-only` (not a server
  // action) and only the ConnectSignupsDisplayConfig attribute value ever
  // leaves this function.
  const campuses = (await rockGetPublic('/Campuses', {
    loadAttributes: 'True',
    $top: 100,
  })) as CampusWithAttributes[];
  const configs: Record<string, CampusDisplayConfig> = {};

  for (const campus of campuses) {
    const shortCode = campus.ShortCode?.trim().toUpperCase();
    if (!shortCode) continue;
    configs[shortCode] = mergeOverDefaults(shortCode, rawConfigForCampus(campus));
  }

  cachedConfigs = { expiresAt: Date.now() + CACHE_TTL_MS, value: configs };
  return configs;
}

export function clearCampusDisplayConfigsCache(): void {
  cachedConfigs = null;
}
