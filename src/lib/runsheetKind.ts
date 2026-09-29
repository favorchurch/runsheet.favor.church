/**
 * Coarse runsheet grouping for the list filter. Rock returns no categories
 * for runsheet channels, so the title is the signal.
 */
import { extractChannelDate } from './runsheetDate';

export type RunsheetKind = 'sunday' | 'youth' | 'kids' | 'grow' | 'other';

export const RUNSHEET_KIND_ORDER: RunsheetKind[] = ['sunday', 'youth', 'kids', 'grow', 'other'];

export const RUNSHEET_KIND_LABELS: Record<RunsheetKind, string> = {
  sunday: 'Sunday',
  youth: 'Youth',
  kids: 'Kids',
  grow: 'Grow',
  other: 'Other',
};

export function getRunsheetKind(name: string): RunsheetKind {
  if (/\bgrow\b/i.test(name)) return 'grow';
  if (/\bkids\b/i.test(name)) return 'kids';
  if (/youth|\bfy\b/i.test(name)) return 'youth';
  if (extractChannelDate(name)?.getDay() === 0) return 'sunday';
  return 'other';
}

export function isGrowRunsheetTitle(name: string): boolean {
  return getRunsheetKind(name) === 'grow';
}
