import 'server-only';

import { GROW_SCHEDULE_CATEGORY_ID, type GrowSchedule } from '@/lib/growRunsheets';
import { rockGet } from '@/server-actions/internal/rockFetch';

/** Active schedules in Rock's "Grow Courses" category; each one is a topic. */
export async function fetchGrowSchedules(): Promise<GrowSchedule[]> {
  const rows = (await rockGet('/Schedules', {
    $filter: `CategoryId eq ${GROW_SCHEDULE_CATEGORY_ID} and IsActive eq true`,
    $select: 'Id,Name,iCalendarContent,EffectiveEndDate',
    $orderby: 'Name asc',
  })) as Array<{ Id: number; Name: string; iCalendarContent?: string; EffectiveEndDate?: string | null }> | null;

  return (rows || []).map((r) => ({
    id: Number(r.Id),
    name: r.Name,
    iCalendarContent: r.iCalendarContent || '',
    effectiveEndDate: r.EffectiveEndDate ?? null,
  }));
}
