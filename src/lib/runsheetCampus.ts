/**
 * Campus isolation for the runsheet feature.
 *
 * Runsheet channel names carry their campus as a prefix (e.g. `MNL Crowne //
 * August 9, 2026 // 10AM`), and Rock's own group structure already encodes
 * per-campus staff/volunteer scoping: Group 46 "Global Staff" is documented in
 * Rock itself as the only group whose membership grants cross-campus access,
 * with "Manila" / "Brisbane" / "Seoul" organizational folders beneath it for
 * each campus's staff role groups, and Ministry Teams (56) rooting the
 * per-campus volunteer team trees the same way. `rockResolveAccess` walks
 * that structure into `access.runsheetCampuses`; this module is the shared
 * vocabulary both that resolver and the runsheet list/detail actions check
 * against, so a channel's campus is read the same way everywhere.
 */

export type RunsheetCampusCode = 'MNL' | 'BNE' | 'SEL';

export const RUNSHEET_CAMPUS_CODES: RunsheetCampusCode[] = ['MNL', 'BNE', 'SEL'];

/** Present in `runsheetCampuses` for Global Staff / Rock Administration — bypasses all campus filtering. */
export const ALL_CAMPUSES = 'ALL';

const CAMPUS_NAME_MARKERS: Record<RunsheetCampusCode, string[]> = {
  MNL: ['MNL', 'MANILA'],
  BNE: ['BNE', 'BRISBANE'],
  SEL: ['SEL', 'SEOUL'],
};

/** Reads the campus code off a runsheet channel's own name, e.g. `"MNL Crowne // ..."` → `"MNL"`. */
export function extractRunsheetCampus(channelName: string): RunsheetCampusCode | null {
  if (!channelName) return null;
  const upper = channelName.toUpperCase();

  for (const code of RUNSHEET_CAMPUS_CODES) {
    if (CAMPUS_NAME_MARKERS[code].some((marker) => upper.includes(marker))) return code;
  }

  return null;
}

/**
 * True when a user whose access resolved to `runsheetCampuses` may see a
 * channel with this name. Channels with no recognizable campus marker are
 * excluded for campus-scoped users — an unlabeled channel isn't "visible to
 * everyone" by default, only to Global Staff / Rock Administration.
 */
export function canAccessRunsheetChannel(runsheetCampuses: string[] | undefined, channelName: string): boolean {
  const scope = runsheetCampuses || [];
  if (scope.includes(ALL_CAMPUSES)) return true;

  const campus = extractRunsheetCampus(channelName);
  return campus !== null && scope.includes(campus);
}
