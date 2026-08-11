'use client';

import React, { useState } from 'react';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { parsePeopleString } from './PeopleSearchDropdown';
import { HiUserGroup, HiPencilSquare, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { RichTextContent } from './RichTextContent';

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const platform = computePlatformRoles(items, columns);
  const personCol = columns.find(isPersonColumn) || columns[0] || { key: 'PLATFORM' };

  const getRosterValue = (role: string) => {
    const title = `Roster: ${role}`;
    const row = items.find((item) => item.title === title);
    return row?.attributeValues?.[personCol.key] || '';
  };

  const assignedCount = VITAL_ROLES.filter((r) => !!getRosterValue(r)).length;

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:p-3 shadow-xs mb-3">
      {/* Card Header & Toggle */}
      <div className={`flex items-center justify-between gap-2 ${isCollapsed ? '' : 'border-b border-slate-200 pb-2 mb-2'}`}>
        <div
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 cursor-pointer select-none flex-1"
        >
          <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs shrink-0">
            <HiUserGroup className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Event Team Roster</h3>
              <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-800">
                {assignedCount}/{VITAL_ROLES.length} Assigned
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium truncate hidden sm:block">
              Vital service roles & platform schedule contacts
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
        >
          <span>{isCollapsed ? 'Show Roster' : 'Hide Roster'}</span>
          {isCollapsed ? <HiChevronDown className="h-3.5 w-3.5" /> : <HiChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Roster Body (collapsible) */}
      {!isCollapsed && (
        <div className="space-y-2.5">
          {/* Vital Event Roles Grid */}
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
              Vital Roles
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 text-xs">
              {VITAL_ROLES.map((role) => {
                const val = getRosterValue(role);
                const isEditing = editingRoleTitle === `Roster: ${role}`;

                return (
                  <div
                    key={role}
                    onClick={() => !readOnly && onOpenRolePicker(`Roster: ${role}`)}
                    className={`relative flex flex-col justify-between rounded-lg border p-1.5 sm:p-2 transition-all min-h-[44px] ${
                      isEditing
                        ? 'border-slate-900 bg-slate-100 ring-2 ring-slate-800 shadow-sm z-30'
                        : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-100/50'
                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                        {role}
                      </span>
                      {!readOnly && <HiPencilSquare className="h-3 w-3 text-slate-400 shrink-0" />}
                    </div>
                    {isEditing && renderPeoplePicker ? (
                      <div onClick={(e) => e.stopPropagation()} className="mt-1">
                        {renderPeoplePicker(`Roster: ${role}`)}
                      </div>
                    ) : (
                      <div className="text-[11px] sm:text-xs font-semibold text-slate-900 break-words leading-tight mt-0.5">
                        {val ? (
                          <span className="font-bold text-slate-950">{val}</span>
                        ) : (
                          <span className="text-[10px] italic font-normal text-slate-400">
                            {readOnly ? 'Unassigned' : '+ Assign'}
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
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
              Platform Roles (From Schedule)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 text-xs mb-2">
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Runsheet Huddle</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block">{platform.runsheetHuddle || <em className="text-slate-400 font-normal text-[10px]">None</em>}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Huddle Hype</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block">{platform.huddleHype || <em className="text-slate-400 font-normal text-[10px]">None</em>}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">MC 1</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block">{platform.mc1 || <em className="text-slate-400 font-normal text-[10px]">None</em>}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">MC 2</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block">{platform.mc2 || <em className="text-slate-400 font-normal text-[10px]">None</em>}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 col-span-2 sm:col-span-1">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Preacher</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block">{platform.preacher || <em className="text-slate-400 font-normal text-[10px]">None</em>}</span>
              </div>
            </div>

            {/* Wrap/Up Announcements Box */}
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Wrap/Up Announcements
              </span>
              {platform.wrapText ? (
                <div className="text-[11px] sm:text-xs text-slate-900 leading-relaxed max-h-32 overflow-y-auto pr-1">
                  <RichTextContent value={platform.wrapText} />
                </div>
              ) : (
                <em className="text-slate-400 font-normal text-[10px]">None in Wrap-up</em>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
