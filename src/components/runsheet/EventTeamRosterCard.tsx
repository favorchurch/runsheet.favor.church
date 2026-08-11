'use client';

import React from 'react';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { parsePeopleString } from './PeopleSearchDropdown';
import { HiUserGroup, HiSparkles, HiPencilSquare } from 'react-icons/hi2';

export const VITAL_ROLES = [
  'Service Director',
  'Service Producer',
  'Stage Manager Captain',
  'Music Director',
  'Offstage Director',
  'Worship Leaders',
  'Host Core Cap',
  'Security Lead',
] as const;

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

  const huddleRow = findRow(['all-in huddle']);
  const mc1Row = findRow(['mc1', 'mc 1']);
  const mc2Row = findRow(['mc2', 'mc 2']);
  const preacherRow = findRow(['sermon', 'preacher']);
  const wrapRow = findRow(['wrap-up', 'wrap/up', 'announcements']);

  return {
    huddleHype: huddleRow ? extractPeopleFromRow(huddleRow, columns).join(', ') : '',
    mc1: mc1Row ? extractPeopleFromRow(mc1Row, columns).join(', ') : '',
    mc2: mc2Row ? extractPeopleFromRow(mc2Row, columns).join(', ') : '',
    preacher: preacherRow ? extractPeopleFromRow(preacherRow, columns).join(', ') : '',
    wrapText: wrapRow ? (wrapRow.detail || '').replace(/<[^>]*>/g, '').trim() : '',
  };
}

export function ensureRosterItems(items: RunsheetItemRow[]): RunsheetItemRow[] {
  const updated = [...items];
  VITAL_ROLES.forEach((role, idx) => {
    const title = `Roster: ${role}`;
    const exists = updated.some((item) => item.title === title);
    if (!exists) {
      updated.push({
        id: `new_roster_${role.replace(/\s+/g, '_')}`,
        title,
        order: -100 + idx,
        duration: 0,
        attributeValues: {},
        isNew: true,
      });
    }
  });
  return updated;
}

interface EventTeamRosterCardProps {
  items: RunsheetItemRow[];
  columns: DynamicAttributeColumn[];
  readOnly?: boolean;
  editingRoleTitle?: string | null;
  onOpenRolePicker: (roleTitle: string) => void;
  renderPeoplePicker?: (roleTitle: string) => React.ReactNode;
}

export function EventTeamRosterCard({
  items,
  columns,
  readOnly = false,
  editingRoleTitle = null,
  onOpenRolePicker,
  renderPeoplePicker,
}: EventTeamRosterCardProps) {
  const platform = computePlatformRoles(items, columns);
  const personCol = columns.find(isPersonColumn) || columns[0] || { key: 'PLATFORM' };

  const getRosterValue = (role: string) => {
    const title = `Roster: ${role}`;
    const row = items.find((item) => item.title === title);
    return row?.attributeValues?.[personCol.key] || '';
  };

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 shadow-xs mb-3">
      {/* Card Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
          <HiUserGroup className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Event Team Roster</h3>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Vital service roles & platform schedule contacts at a glance</p>
        </div>
      </div>

      {/* Vital Event Roles Grid */}
      <div className="mb-4">
        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 mb-2">
          Vital Roles (Assigned Team)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {VITAL_ROLES.map((role) => {
            const val = getRosterValue(role);
            const isEditing = editingRoleTitle === `Roster: ${role}`;

            return (
              <div
                key={role}
                onClick={() => !readOnly && onOpenRolePicker(`Roster: ${role}`)}
                className={`relative flex flex-col justify-between rounded-lg border p-2.5 transition-all ${
                  isEditing
                    ? 'border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-500 shadow-sm z-30'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
                } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{role}</span>
                  {!readOnly && <HiPencilSquare className="h-3 w-3 text-slate-400" />}
                </div>
                {isEditing && renderPeoplePicker ? (
                  <div onClick={(e) => e.stopPropagation()} className="mt-1">
                    {renderPeoplePicker(`Roster: ${role}`)}
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-slate-900 break-words">
                    {val ? (
                      <span className="inline-flex flex-wrap items-center gap-1 font-bold text-indigo-950">
                        {val}
                      </span>
                    ) : (
                      <span className="text-[11px] italic font-normal text-slate-400">
                        {readOnly ? 'Unassigned' : '+ Attach person...'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform & Schedule Contacts Grid */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <HiSparkles className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
            Platform Roles (Auto-populated from Schedule)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Huddle Hype</span>
            <span className="font-semibold text-slate-900">{platform.huddleHype || <em className="text-slate-400 font-normal text-[11px]">None in All-In Huddle</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MC 1</span>
            <span className="font-semibold text-slate-900">{platform.mc1 || <em className="text-slate-400 font-normal text-[11px]">None in MC1</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MC 2</span>
            <span className="font-semibold text-slate-900">{platform.mc2 || <em className="text-slate-400 font-normal text-[11px]">None in MC2</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Preacher</span>
            <span className="font-semibold text-slate-900">{platform.preacher || <em className="text-slate-400 font-normal text-[11px]">None in Sermon</em>}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Wrap/Up Announcements</span>
            <span className="font-semibold text-slate-900 truncate block">{platform.wrapText || <em className="text-slate-400 font-normal text-[11px]">None in Wrap-up</em>}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
