'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { isPersonColumn } from '@/constants/runsheetColumns';
import { parsePeopleString } from './PeopleSearchDropdown';
import { HiUserGroup, HiPencilSquare, HiChevronDown, HiChevronUp, HiXMark, HiUser } from 'react-icons/hi2';
import { RichTextContent } from './RichTextContent';
import { getRosterCollapsedPreference, setRosterCollapsedPreference } from '@/lib/userPreferences';

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

function getInitials(name: string): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface EventTeamRosterCardProps {
  items: RunsheetItemRow[];
  columns: DynamicAttributeColumn[];
  readOnly?: boolean;
  editingRoleTitle?: string | null;
  onOpenRolePicker: (roleTitle: string) => void;
  renderPeoplePicker?: (roleTitle: string) => React.ReactNode;
}

interface RosterModalData {
  title: string;
  category: 'Service Role' | 'Platform Role';
  value: string;
  isWrapUp?: boolean;
}

export function EventTeamRosterCard({
  items,
  columns,
  readOnly = false,
  editingRoleTitle = null,
  onOpenRolePicker,
  renderPeoplePicker,
}: EventTeamRosterCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeModalData, setActiveModalData] = useState<RosterModalData | null>(null);
  const [mounted, setMounted] = useState(false);
  const platform = computePlatformRoles(items, columns);
  const personCol = columns.find(isPersonColumn) || columns[0] || { key: 'PLATFORM' };

  useEffect(() => {
    setMounted(true);
    const preferredCollapsed = getRosterCollapsedPreference();
    setIsCollapsed(preferredCollapsed);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      setRosterCollapsedPreference(next);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalData(null);
      }
    };
    if (activeModalData) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [activeModalData]);

  const getRosterValue = (role: string) => {
    const title = `Roster: ${role}`;
    const row = items.find((item) => item.title === title);
    return row?.attributeValues?.[personCol.key] || '';
  };

  const assignedCount = VITAL_ROLES.filter((r) => !!getRosterValue(r)).length;

  return (
    <div className="w-full max-w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-2 sm:p-2.5 shadow-xs mb-2 overflow-hidden">
      {/* Card Header & Toggle */}
      <div className={`flex items-center justify-between gap-2 ${isCollapsed ? '' : 'border-b border-slate-200 pb-1.5 mb-1.5'}`}>
        <div
          onClick={toggleCollapsed}
          className="flex items-center gap-2 cursor-pointer select-none flex-1"
        >
          <div className="flex h-6 w-6 sm:h-6.5 sm:w-6.5 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs shrink-0">
            <HiUserGroup className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Event Team Roster</h3>
              <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-800">
                {assignedCount}/{VITAL_ROLES.length} Assigned
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium truncate hidden sm:block">
              Vital service roles & platform schedule contacts (tap any box to view full roster)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 touch-manipulation"
        >
          <span>{isCollapsed ? 'Show Roster' : 'Hide Roster'}</span>
          {isCollapsed ? <HiChevronDown className="h-3.5 w-3.5" /> : <HiChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Roster Body (collapsible) */}
      {!isCollapsed && (
        <div className="space-y-2">
          {/* Vital Event Roles Grid */}
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
              Service Roles
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 gap-1.5 text-xs">
              {VITAL_ROLES.map((role) => {
                const val = getRosterValue(role);
                const isEditing = editingRoleTitle === `Roster: ${role}`;

                return (
                  <div
                    key={role}
                    onClick={() => {
                      if (isEditing) return;
                      if (!val && !readOnly) {
                        onOpenRolePicker(`Roster: ${role}`);
                      } else {
                        setActiveModalData({
                          title: role,
                          category: 'Service Role',
                          value: val,
                        });
                      }
                    }}
                    className={`relative flex flex-col justify-between rounded-lg border p-1.5 sm:p-2 min-h-[44px] transition-all cursor-pointer touch-manipulation select-none ${
                      isEditing
                        ? 'border-slate-900 bg-slate-100 ring-2 ring-slate-800 shadow-sm z-30'
                        : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-100/70 hover:shadow-2xs active:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">
                        {role}
                      </span>
                      {!readOnly && !isEditing && (
                        <button
                          type="button"
                          title="Edit Role Assignment"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRolePicker(`Roster: ${role}`);
                          }}
                          className="p-1 -mr-1 -mt-1 text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 rounded transition-colors shrink-0 touch-manipulation"
                        >
                          <HiPencilSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {isEditing && renderPeoplePicker ? (
                      <div onClick={(e) => e.stopPropagation()} className="mt-1">
                        {renderPeoplePicker(`Roster: ${role}`)}
                      </div>
                    ) : (
                      <div className="text-[11px] font-semibold text-slate-900 truncate block mt-0.5" title={val}>
                        {val ? (
                          <span className="font-semibold text-slate-950">{val}</span>
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
              <div
                onClick={() =>
                  setActiveModalData({
                    title: 'Runsheet Huddle',
                    category: 'Platform Role',
                    value: platform.runsheetHuddle,
                  })
                }
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 sm:p-2 min-h-[48px] hover:border-slate-400 hover:bg-slate-100/70 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
              >
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Runsheet Huddle</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block mt-0.5" title={platform.runsheetHuddle}>{platform.runsheetHuddle || <em className="text-slate-400 font-normal text-[10px] not-italic">None</em>}</span>
              </div>
              <div
                onClick={() =>
                  setActiveModalData({
                    title: 'Huddle Hype',
                    category: 'Platform Role',
                    value: platform.huddleHype,
                  })
                }
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 sm:p-2 min-h-[48px] hover:border-slate-400 hover:bg-slate-100/70 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
              >
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Huddle Hype</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block mt-0.5" title={platform.huddleHype}>{platform.huddleHype || <em className="text-slate-400 font-normal text-[10px] not-italic">None</em>}</span>
              </div>
              <div
                onClick={() =>
                  setActiveModalData({
                    title: 'MC 1',
                    category: 'Platform Role',
                    value: platform.mc1,
                  })
                }
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 sm:p-2 min-h-[48px] hover:border-slate-400 hover:bg-slate-100/70 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
              >
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">MC 1</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block mt-0.5" title={platform.mc1}>{platform.mc1 || <em className="text-slate-400 font-normal text-[10px] not-italic">None</em>}</span>
              </div>
              <div
                onClick={() =>
                  setActiveModalData({
                    title: 'MC 2',
                    category: 'Platform Role',
                    value: platform.mc2,
                  })
                }
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 sm:p-2 min-h-[48px] hover:border-slate-400 hover:bg-slate-100/70 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
              >
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">MC 2</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block mt-0.5" title={platform.mc2}>{platform.mc2 || <em className="text-slate-400 font-normal text-[10px] not-italic">None</em>}</span>
              </div>
              <div
                onClick={() =>
                  setActiveModalData({
                    title: 'Preacher',
                    category: 'Platform Role',
                    value: platform.preacher,
                  })
                }
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 sm:p-2 min-h-[48px] hover:border-slate-400 hover:bg-slate-100/70 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
              >
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">Preacher</span>
                <span className="font-semibold text-slate-900 text-[11px] truncate block mt-0.5" title={platform.preacher}>{platform.preacher || <em className="text-slate-400 font-normal text-[10px] not-italic">None</em>}</span>
              </div>
            </div>

            {/* Wrap/Up Announcements Box */}
            <div
              onClick={() =>
                setActiveModalData({
                  title: 'Wrap/Up Announcements',
                  category: 'Platform Role',
                  value: platform.wrapText,
                  isWrapUp: true,
                })
              }
              className="rounded-lg border border-slate-200 bg-white p-2 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer touch-manipulation select-none"
            >
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Wrap/Up Announcements
              </span>
              {platform.wrapText ? (
                <div className="text-[11px] sm:text-xs text-slate-900 leading-relaxed max-h-32 overflow-y-auto pl-1.5 pr-1">
                  <RichTextContent value={platform.wrapText} />
                </div>
              ) : (
                <em className="text-slate-400 font-normal text-[10px]">None in Wrap-up</em>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Roster Names Detail Popup Modal via Portal to Body */}
      {mounted && activeModalData && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity overflow-hidden touch-none"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setActiveModalData(null)}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] my-auto animate-in zoom-in-95 duration-150 touch-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-4 sm:px-5 py-3.5 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white shrink-0">
                  <HiUserGroup className="h-4 w-4 text-slate-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate leading-tight">
                    {activeModalData.title}
                  </h3>
                  <span className="inline-block mt-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                    {activeModalData.category}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalData(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation"
                title="Close"
              >
                <HiXMark className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body (Strictly View-Only) */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              {activeModalData.isWrapUp ? (
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                    Announcement Details
                  </span>
                  {activeModalData.value ? (
                    <div className="text-xs sm:text-sm text-slate-900 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <RichTextContent value={activeModalData.value} />
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs italic">
                      No announcement details provided
                    </div>
                  )}
                </div>
              ) : (
                (() => {
                  const people = parsePeopleString(activeModalData.value);
                  return (
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                          Assigned Roster
                        </span>
                        <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {people.length} {people.length === 1 ? 'Person' : 'People'}
                        </span>
                      </div>

                      {people.length === 0 ? (
                        <div className="py-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                          <HiUser className="mx-auto h-8 w-8 text-slate-300 mb-1.5" />
                          <p className="text-xs font-semibold text-slate-500">No one assigned yet</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          {people.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 shadow-2xs"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-xs shadow-xs">
                                {getInitials(p.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                              </div>
                              {p.isGuest && (
                                <span className="inline-block text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                                  Guest
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Modal Footer (Exit action ONLY) */}
            <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setActiveModalData(null)}
                className="w-full sm:w-auto rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

