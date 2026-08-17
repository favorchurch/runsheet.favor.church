import type { RunsheetCampusCode } from './runsheetCampus';

/** Rock's per-campus organizational folders under Global Staff (Group Type 28). */
export const CAMPUS_ORG_UNIT_ROOT_IDS: Record<number, RunsheetCampusCode> = {
  32893: 'MNL',
  32898: 'BNE',
  32902: 'SEL',
};

/** Rock's per-campus Ministry Team roots under "Ministry Teams" (Group Type 23). */
export const CAMPUS_MINISTRY_TEAM_ROOT_IDS: Record<number, RunsheetCampusCode> = {
  57: 'MNL',
  59: 'BNE',
  58: 'SEL',
};
