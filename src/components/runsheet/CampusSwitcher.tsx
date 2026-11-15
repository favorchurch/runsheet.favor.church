'use client';

import React from 'react';
import { ALL_CAMPUSES, RUNSHEET_CAMPUS_CODES, type RunsheetCampusCode } from '@/lib/runsheetCampus';

export type CampusSwitcherValue = typeof ALL_CAMPUSES | RunsheetCampusCode;

export const CAMPUS_SWITCHER_OPTIONS: CampusSwitcherValue[] = [ALL_CAMPUSES, ...RUNSHEET_CAMPUS_CODES];

export const STORAGE_KEY_CAMPUS_SWITCHER = 'runsheet_pref_campus';
export const STORAGE_KEY_CAMPUS_SWITCHER_OWNER = 'runsheet_pref_campus_owner';

function clearLegacyLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY_CAMPUS_SWITCHER);
  } catch {
    // Gracefully ignore storage exceptions
  }
}

/**
 * A deliberate campus choice belongs to the signed-in identity, not the browser tab.
 * Clear preferences on account changes and do not reuse the old unscoped session key.
 */
export function getCampusSwitcherPreference(ownerKey?: string | null): CampusSwitcherValue | null {
  if (typeof window === 'undefined') return null;
  clearLegacyLocalStorage();
  try {
    const storage = window.sessionStorage;
    if (!ownerKey || storage?.getItem(STORAGE_KEY_CAMPUS_SWITCHER_OWNER) !== ownerKey) {
      storage?.removeItem(STORAGE_KEY_CAMPUS_SWITCHER);
      storage?.removeItem(STORAGE_KEY_CAMPUS_SWITCHER_OWNER);
      return null;
    }
    const stored = storage?.getItem(STORAGE_KEY_CAMPUS_SWITCHER);
    return CAMPUS_SWITCHER_OPTIONS.find((option) => option === stored) ?? null;
  } catch {
    return null;
  }
}

export function setCampusSwitcherPreference(value: CampusSwitcherValue, ownerKey?: string | null): void {
  if (typeof window === 'undefined' || !ownerKey) return;
  clearLegacyLocalStorage();
  try {
    const storage = window.sessionStorage;
    // Invalidating the owner first prevents a partial write from crossing accounts.
    storage?.removeItem(STORAGE_KEY_CAMPUS_SWITCHER_OWNER);
    storage?.setItem(STORAGE_KEY_CAMPUS_SWITCHER, value);
    storage?.setItem(STORAGE_KEY_CAMPUS_SWITCHER_OWNER, ownerKey);
  } catch {
    // Gracefully ignore storage exceptions (e.g. private browsing, quota)
  }
}

/** True when the access scope spans every campus (Global Staff / Rock Administration). */
export function hasAllCampusAccess(runsheetCampuses: string[] | undefined): boolean {
  return runsheetCampuses?.includes(ALL_CAMPUSES) ?? false;
}

interface CampusSwitcherProps {
  value: CampusSwitcherValue;
  onChange: (value: CampusSwitcherValue) => void;
}

/** All / MNL / BNE / SEL picker shown only to users with all-campus access. */
export function CampusSwitcher({ value, onChange }: CampusSwitcherProps) {
  return (
    <div role="group" aria-label="Campus" className="flex items-center gap-1 overflow-x-auto py-0.5">
      {CAMPUS_SWITCHER_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
            value === option
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          {option === ALL_CAMPUSES ? 'All' : option}
        </button>
      ))}
    </div>
  );
}
