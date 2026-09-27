'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserEditRunsheet } from '@/lib/permissions';
import { GROW_CONTENT_CHANNEL_CATEGORY_ID, planMissingGrowRunsheets } from '@/lib/growRunsheets';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
import { isRedisEnabled, redisCommand } from '@/server-actions/internal/redisClient';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';

const RUNSHEET_CONTENT_CHANNEL_TYPE_ID = 13;
const LOCK_KEY = 'runsheet:grow-sync';
const LOCK_TTL_SECONDS = 600;

let memoryLockUntil = 0;

/** Test hook: clears the in-memory lock used when Redis is not configured. */
export async function resetGrowSyncLockForTests(): Promise<void> {
  memoryLockUntil = 0;
}

async function acquireLock(): Promise<boolean> {
  if (isRedisEnabled()) {
    return (await redisCommand<string>(['SET', LOCK_KEY, '1', 'NX', 'EX', LOCK_TTL_SECONDS])) === 'OK';
  }
  const now = Date.now();
  if (now < memoryLockUntil) return false;
  memoryLockUntil = now + LOCK_TTL_SECONDS * 1000;
  return true;
}

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

/**
 * Creates a runsheet for every upcoming Grow Courses occurrence that has
 * none yet. Fired from the runsheet list on load; safe to call repeatedly.
 * Each creation goes through rockCreateServiceRunsheet, so the caller's
 * edit access is re-checked per title.
 */
export async function rockSyncGrowRunsheets(): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    const session = await getRockSession();
    if (!canUserEditRunsheet(session)) return { success: true, created: 0 };
    if (!(await acquireLock())) return { success: true, created: 0 };

    const [schedules, channels] = await Promise.all([
      fetchGrowSchedules(),
      rockGet('/ContentChannels', {
        $filter: `ContentChannelTypeId eq ${RUNSHEET_CONTENT_CHANNEL_TYPE_ID}`,
        $select: 'Name',
        $top: 5000,
      }, true) as Promise<Array<{ Name: string }> | null>,
    ]);

    const titles = planMissingGrowRunsheets(schedules, (channels || []).map((c) => c.Name), manilaToday());

    let created = 0;
    for (const title of titles) {
      try {
        const res = await rockCreateServiceRunsheet(title, RUNSHEET_CONTENT_CHANNEL_TYPE_ID, GROW_CONTENT_CHANNEL_CATEGORY_ID);
        if (res.success) created++;
        else console.warn(`[grow-sync] could not create "${title}": ${res.error}`);
      } catch (error) {
        console.warn(`[grow-sync] could not create "${title}"`, error);
      }
    }
    return { success: true, created };
  } catch (error) {
    console.error('[grow-sync] failed', error);
    return { success: false, created: 0, error: 'Grow runsheet sync failed.' };
  }
}
