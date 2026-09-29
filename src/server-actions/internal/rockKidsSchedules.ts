import 'server-only';

import {
  descendantCategoryIds,
  KIDS_SERVICES_CATEGORY_ID,
  SCHEDULE_CATEGORY_ENTITY_TYPE_ID,
} from '@/lib/scheduleCategoryTree';
import { rockGet } from '@/server-actions/internal/rockFetch';

/** Ids of every schedule (active or not) anywhere under Rock's KIDS SERVICES tree. */
export async function fetchKidsScheduleIds(): Promise<Set<number>> {
  const categories = ((await rockGet('/Categories', {
    $filter: `EntityTypeId eq ${SCHEDULE_CATEGORY_ENTITY_TYPE_ID}`,
    $select: 'Id,ParentCategoryId',
    $top: 1000,
  })) || []) as Array<{ Id: number; ParentCategoryId: number | null }>;

  const kidsCategoryIds = descendantCategoryIds(
    categories.map((c) => ({ id: Number(c.Id), parentId: c.ParentCategoryId ?? null })),
    KIDS_SERVICES_CATEGORY_ID,
  );

  const schedules = ((await rockGet('/Schedules', {
    $filter: kidsCategoryIds.map((id) => `CategoryId eq ${id}`).join(' or '),
    $select: 'Id',
    $top: 1000,
  })) || []) as Array<{ Id: number }>;

  return new Set(schedules.map((s) => Number(s.Id)).filter((id) => id > 0));
}
