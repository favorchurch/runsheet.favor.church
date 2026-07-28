import { ConnectAgeGroup } from '@/connectGroupAttributes';

/**
 * Age-group label colors for the Department tracker and the section-header
 * age-group pills. Values mirror the existing in-code colors in
 * AttendanceRateTableCSS.tsx — keep the two hex sets in sync if either changes.
 * Youth keeps the `lightgreen` background but uses black text for contrast
 * (design decision 2026-06-05). Kids was historically omitted (no Kids Connect
 * groups) but now carries a color so the section-header pills can render it.
 */
export const CONNECT_AGE_GROUP_COLORS: Partial<
  Record<ConnectAgeGroup, { bg: string; text: string }>
> = {
  Seasoned: { bg: '#46162f', text: '#ffffff' },
  Adults: { bg: '#274482', text: '#ffffff' },
  'Young Adults': { bg: '#704216', text: '#ffffff' },
  Youth: { bg: 'lightgreen', text: '#000000' },
  Kids: { bg: '#6d28d9', text: '#ffffff' },
};

/** Compact acronyms for age-group pills on mobile (below the 768px breakpoint). */
export const CONNECT_AGE_GROUP_ACRONYMS: Record<ConnectAgeGroup, string> = {
  Adults: 'A',
  Seasoned: 'S',
  'Young Adults': 'YA',
  Youth: 'Y',
  Kids: 'K',
};

/**
 * Neutral fallback pill for connect groups whose age group is missing or does
 * not resolve to a canonical ConnectAgeGroup. Gray-200 bg / gray-700 text.
 */
export const AGE_GROUP_UNKNOWN = {
  bg: '#e5e7eb',
  text: '#374151',
  acronym: '?',
  label: 'Unknown',
} as const;
