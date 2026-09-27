export const STORAGE_KEY_VIEW_MODE = 'runsheet_pref_view_mode';
export const STORAGE_KEY_ROSTER_COLLAPSED = 'runsheet_pref_roster_collapsed';

export type ViewMode = 'grid' | 'cards';

/**
 * Retrieves the user's preferred runsheet view mode from localStorage.
 * Defaults to 'grid' when no valid preference is saved or when storage is unavailable.
 */
export function getViewModePreference(): ViewMode {
  if (typeof window === 'undefined') {
    return 'grid';
  }

  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY_VIEW_MODE);
    if (stored === 'cards' || stored === 'grid') {
      return stored;
    }
    return 'grid';
  } catch {
    return 'grid';
  }
}

/**
 * Persists the user's preferred runsheet view mode to localStorage.
 * Safely ignores errors if localStorage is disabled or throws.
 */
export function setViewModePreference(mode: ViewMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(STORAGE_KEY_VIEW_MODE, mode);
  } catch {
    // Gracefully ignore storage exceptions (e.g. private browsing, quota)
  }
}

/**
 * Retrieves the user's preferred roster collapsed state from localStorage.
 * Defaults to true (roster hidden) when no preference is saved or when storage is unavailable.
 */
export function getRosterCollapsedPreference(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY_ROSTER_COLLAPSED);
    if (stored === 'false') {
      return false;
    }
    if (stored === 'true') {
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Persists the user's preferred roster collapsed state to localStorage.
 * Safely ignores errors if localStorage is disabled or throws.
 */
export function setRosterCollapsedPreference(collapsed: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(STORAGE_KEY_ROSTER_COLLAPSED, String(collapsed));
  } catch {
    // Gracefully ignore storage exceptions (e.g. private browsing, quota)
  }
}

export const STORAGE_KEY_RUNSHEET_KIND = 'runsheet_pref_kind';

const RUNSHEET_KIND_VALUES = ['all', 'sunday', 'youth', 'grow', 'other'] as const;
export type RunsheetKindPreference = (typeof RUNSHEET_KIND_VALUES)[number];

/** The last runsheet list kind filter; defaults to 'all'. */
export function getRunsheetKindPreference(): RunsheetKindPreference {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY_RUNSHEET_KIND);
    return (RUNSHEET_KIND_VALUES as readonly string[]).includes(stored || '') ? (stored as RunsheetKindPreference) : 'all';
  } catch {
    return 'all';
  }
}

export function setRunsheetKindPreference(kind: RunsheetKindPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY_RUNSHEET_KIND, kind);
  } catch {
    // Gracefully ignore storage exceptions (e.g. private browsing, quota)
  }
}
