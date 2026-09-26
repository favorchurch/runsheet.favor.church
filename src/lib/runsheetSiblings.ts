/**
 * Finds same-campus, same-date sibling runsheets for propagation and compare.
 * v1 is intentionally campus-scoped and date-scoped only; `preselected` is
 * always true today but exists so a future "same date, other campuses" option
 * is a change to the filter, not to how the result is consumed.
 */
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { extractChannelDate } from '@/lib/runsheetDate';
import { isGrowRunsheetTitle } from '@/lib/runsheetKind';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';

export interface SiblingChannel {
  channelId: number;
  name: string;
  time: string;
  preselected: boolean;
}

export function extractCourseTitle(title: string): string {
  return title.split('//')[0]?.trim() || title;
}

export function resolveSiblings(
  sourceChannelId: number,
  sourceName: string,
  allChannels: RunsheetChannelOption[],
): SiblingChannel[] {
  if (isGrowRunsheetTitle(sourceName)) {
    const sourceCourse = extractCourseTitle(sourceName);
    return allChannels
      .filter((c) => c.id !== sourceChannelId && extractCourseTitle(c.name) === sourceCourse)
      .sort((a, b) => {
        const da = extractChannelDate(a.name)?.getTime() ?? 0;
        const db = extractChannelDate(b.name)?.getTime() ?? 0;
        return da - db;
      })
      .map((c) => ({
        channelId: c.id,
        name: c.name,
        time: c.time,
        preselected: true,
      }));
  }

  const sourceCampus = extractRunsheetCampus(sourceName);
  const sourceDate = extractChannelDate(sourceName);
  if (!sourceCampus || !sourceDate) return [];

  return allChannels
    .filter((c) => c.id !== sourceChannelId)
    .filter((c) => extractRunsheetCampus(c.name) === sourceCampus)
    .filter((c) => {
      const d = extractChannelDate(c.name);
      return !!d && d.getTime() === sourceDate.getTime();
    })
    .map((c) => ({
      channelId: c.id,
      name: c.name,
      time: c.time,
      preselected: true,
    }));
}
