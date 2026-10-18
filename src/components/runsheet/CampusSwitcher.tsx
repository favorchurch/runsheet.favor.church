'use client';

import React from 'react';
import { ALL_CAMPUSES, RUNSHEET_CAMPUS_CODES, type RunsheetCampusCode } from '@/lib/runsheetCampus';

export type CampusSwitcherValue = typeof ALL_CAMPUSES | RunsheetCampusCode;

export const CAMPUS_SWITCHER_OPTIONS: CampusSwitcherValue[] = [ALL_CAMPUSES, ...RUNSHEET_CAMPUS_CODES];

export const STORAGE_KEY_CAMPUS_SWITCHER = 'runsheet_pref_campus';

/** The last campus picked in this browser; 'ALL' when unset, invalid, or storage is blocked. */
export function getCampusSwitcherPreference(): CampusSwitcherValue {
  if (typeof window === 'undefined') return ALL_CAMPUSES;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY_CAMPUS_SWITCHER);
    return CAMPUS_SWITCHER_OPTIONS.find((option) => option === stored) ?? ALL_CAMPUSES;
  } catch {
    return ALL_CAMPUSES;
  }
}

export function setCampusSwitcherPreference(value: CampusSwitcherValue): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY_CAMPUS_SWITCHER, value);
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
