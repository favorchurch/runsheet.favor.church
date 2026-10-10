/**
 * Pure Event Team Roster helpers shared by the roster card (client) and the
 * runsheet PDF export (server). Kept free of `'use client'` so route handlers
 * can call them directly.
 */
import { isPersonColumn } from '@/constants/runsheetColumns';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

export const VITAL_ROLES = [
  'Service Director',
  'Service Producer',
  'Assistant Service Producers',
  'Stage Manager Captain',
  'Assistant Stage Managers',
  'Music Director',
  'Offstage Director',
  'Worship Leaders',
  'Host Core Cap',
  'Security Lead',
] as const;

export interface PersonItem {
  id: string;
  name: string;
  isGuest: boolean;
}

export function parsePeopleString(str: string): PersonItem[] {
  if (!str || !str.trim()) return [];
  const parts = str.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  return parts.map((part, index) => {
    const isGuest = /\(guest\)$/i.test(part);
    const cleanName = part.replace(/\s*\(guest\)$/i, '').trim();
    return {
      id: `p_${index}_${cleanName.replace(/\s+/g, '_')}`,
      name: cleanName,
      isGuest,
    };
  });
}

export function extractPeopleFromRow(item: RunsheetItemRow, columns: DynamicAttributeColumn[]): string[] {
  const names: string[] = [];
  columns.forEach((col) => {
    if (isPersonColumn(col)) {
      const val = item.attributeValues?.[col.key] || '';
      if (val) {
        parsePeopleString(val).forEach((p) => {
          if (p.name && !names.includes(p.name)) {
            names.push(p.name);
          }
        });
      }
    }
  });
  return names;
}

export function computePlatformRoles(items: RunsheetItemRow[], columns: DynamicAttributeColumn[]) {
  const findRow = (queries: string[]) => {
    return items.find((item) => {
      const cleanTitle = (item.title || '').replace(/<[^>]*>/g, '').toLowerCase().trim();
      return queries.some((q) => cleanTitle.includes(q.toLowerCase()));
    });
  };

  const runsheetHuddleRow = findRow(['runsheet huddle']);
  const huddleRow = findRow(['all-in huddle', 'huddle hype']);
  const mc1Row = findRow(['mc1', 'mc 1']);
  const mc2Row = findRow(['mc2', 'mc 2']);
  const preacherRow = findRow(['sermon', 'preacher']);
  const wrapRow = findRow(['wrap-up', 'wrap/up', 'announcements']);

  return {
    runsheetHuddle: runsheetHuddleRow ? extractPeopleFromRow(runsheetHuddleRow, columns).join(', ') : '',
    huddleHype: huddleRow ? extractPeopleFromRow(huddleRow, columns).join(', ') : '',
    mc1: mc1Row ? extractPeopleFromRow(mc1Row, columns).join(', ') : '',
    mc2: mc2Row ? extractPeopleFromRow(mc2Row, columns).join(', ') : '',
    preacher: preacherRow ? extractPeopleFromRow(preacherRow, columns).join(', ') : '',
    wrapText: wrapRow ? (wrapRow.detail || wrapRow.title || '').trim() : '',
  };
}

/** Rock roster data the card reads (a subset of `RockRosterAssignmentsResult`). */
export interface RosterRockSource {
  linked: boolean;
  readFailed: boolean;
  roles: { roleTitle: string; people: { name: string }[] }[];
}

/**
 * The value the roster card shows for a vital role. Rock is the source of
 * display truth for linked roles; the stored `Roster: <role>` item is the
 * mirror used when Rock has no answer or could not be read.
 */
export function getVitalRoleValue(
  role: string,
  items: RunsheetItemRow[],
  columns: DynamicAttributeColumn[],
  rock?: RosterRockSource,
): string {
  const title = `Roster: ${role}`;
  if (rock?.linked && !rock.readFailed) {
    const fromRock = rock.roles.find((r) => r.roleTitle === title);
    if (fromRock) return fromRock.people.map((p) => p.name).join(', ');
  }
  const personCol = columns.find(isPersonColumn) || columns[0] || { key: 'PLATFORM' };
  const row = items.find((item) => item.title === title);
  return row?.attributeValues?.[personCol.key] || '';
}
