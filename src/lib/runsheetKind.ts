/**
 * Coarse runsheet grouping for the list filter. Rock returns no categories
 * for runsheet channels, so the title is the signal.
 */
import { extractChannelDate } from './runsheetDate';

export type RunsheetKind = 'sunday' | 'youth' | 'grow' | 'other';

export const RUNSHEET_KIND_ORDER: RunsheetKind[] = ['sunday', 'youth', 'grow', 'other'];

export const RUNSHEET_KIND_LABELS: Record<RunsheetKind, string> = {
  sunday: 'Sunday',
  youth: 'Youth',
  grow: 'Grow',
  other: 'Other',
};

export function getRunsheetKind(name: string): RunsheetKind {
  if (/\bgrow\b/i.test(name)) return 'grow';
  if (/youth|\bfy\b/i.test(name)) return 'youth';
  if (extractChannelDate(name)?.getDay() === 0) return 'sunday';
  return 'other';
}
