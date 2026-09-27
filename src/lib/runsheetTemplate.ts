/**
 * Per-campus runsheet master templates. A template is an ordinary runsheet
 * channel whose name carries its campus marker, so the existing campus gates
 * (`canAccessRunsheetChannel`, `assertRunsheetEditAccess`) isolate it with no
 * special cases.
 */
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import type { RunsheetCampusCode } from '@/lib/runsheetCampus';
import type { RunsheetItemRow } from '@/types/Runsheet';

export const MASTER_TEMPLATE_SUFFIX = 'Runsheet Master Template';

export function masterTemplateName(campus: RunsheetCampusCode): string {
  return `${campus} // ${MASTER_TEMPLATE_SUFFIX}`;
}

export function isMasterTemplateName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(MASTER_TEMPLATE_SUFFIX.toLowerCase());
}

/** The hardcoded Sunday template as unsaved rows — the seed and the fallback. */
export function buildDefaultTemplateItems(): RunsheetItemRow[] {
  const stamp = Date.now();
  return DEFAULT_RUNSHEET_TEMPLATE.map((row, idx) => ({
    id: `new_${idx}_${stamp}`,
    isNew: true,
    title: row.title,
    duration: row.duration,
    attributeValues: {
      ACTIVITYTITLE: row.activityTitle || row.title,
      DESCRIPTION: row.detail,
      DETIAL: row.detail,
    },
    detail: row.detail,
    order: idx + 1,
    anchorPreacher: '',
    mainInstrument: '',
    ledLiveScreens: '',
    overlayBroadcast: '',
    lighting: '',
    audio: '',
  }));
}
