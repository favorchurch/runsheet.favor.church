'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { RunsheetItemRow, DynamicAttributeColumn } from '@/server-actions/rockGetRunsheetDetails';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { searchRockPeople, RockPersonSearchResult } from '@/server-actions/searchRockPeople';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import { HiPlus, HiTrash, HiBars3, HiCheck, HiExclamationCircle, HiSparkles } from 'react-icons/hi2';

interface RunsheetTableEditorProps {
  channelId: number;
  channelName: string;
  columns?: DynamicAttributeColumn[];
  initialItems: RunsheetItemRow[];
  initialStartTime?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60;
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return 9 * 60;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[4]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function formatMinutesToTimeWithSeconds(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.floor((totalMinutes * 60) % 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
  return `${hours12}:${minsStr}:${secsStr} ${period}`;
}

function formatDurationToHMS(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '00:00:00';
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.floor((totalMinutes * 60) % 60);
  const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
  return `${hoursStr}:${minsStr}:${secsStr}`;
}

function parseDurationInputToMinutes(input: string): number {
  if (!input) return 0;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const parts = trimmed.split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  } else if (parts.length === 2) {
    return parts[0] + parts[1] / 60;
  }
  return 0;
}

// Parses **bold** and ~~italic~~ markdown syntax for display cells
function renderFormattedText(text: string) {
  if (!text) return null;

  const regex = /(\*\*.*?\*\*|~~.*?~~|<b>.*?<\/b>|<i>.*?<\/i>)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-extrabold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('<b>') && part.endsWith('</b>')) {
      return (
        <strong key={index} className="font-extrabold text-slate-900">
          {part.slice(3, -4)}
        </strong>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <em key={index} className="italic text-slate-800 font-medium">
          {part.slice(2, -2)}
        </em>
      );
    }
    if (part.startsWith('<i>') && part.endsWith('</i>')) {
      return (
        <em key={index} className="italic text-slate-800 font-medium">
          {part.slice(3, -4)}
        </em>
      );
    }
    return part;
  });
}

function PeopleSearchDropdown({
  initialValue,
  onSelectPerson,
  onClose,
}: {
  initialValue: string;
  onSelectPerson: (personName: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<RockPersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchRockPeople(searchTerm);
      setResults(res);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        autoFocus
        onFocus={(e) => {
          const len = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(len, len);
        }}
        className="w-full bg-white px-2 py-0.5 border border-pink-600 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-600 text-xs font-medium"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onBlur={() => {
          setTimeout(() => onClose(), 200);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
        placeholder=""
      />

      {/* Rock People Dropdown */}
      {(results.length > 0 || loading) && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-48 overflow-y-auto rounded-md bg-white p-1 shadow-lg border border-slate-200 text-xs text-slate-900">
          {loading && <div className="p-2 text-slate-400 italic">Searching...</div>}

          {!loading &&
            results.map((person) => (
              <div
                key={person.id}
                onMouseDown={() => {
                  onSelectPerson(person.name);
                  onClose();
                }}
                className="px-2 py-1.5 hover:bg-pink-50 hover:text-pink-900 rounded cursor-pointer flex flex-col text-left"
              >
                <span className="font-semibold text-slate-800">{person.name}</span>
                {person.email && <span className="text-[10px] text-slate-400">{person.email}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Fallback attribute columns if none returned from Rock RMS
const FALLBACK_COLUMNS: DynamicAttributeColumn[] = [
  { id: 10266, key: 'DESCRIPTION', name: 'Detail' },
  { id: 7626, key: 'PLATFORM', name: 'Anchor / Preacher', fieldTypeId: 18 },
  { id: 7878, key: 'MAININSTRUMENT', name: 'Main Instrument' },
  { id: 7616, key: 'LED WALL', name: 'LED / Live Screens' },
  { id: 7617, key: 'OVERLAYBROADCAST', name: 'Overlay / Broadcast' },
  { id: 7618, key: 'LIGHTING', name: 'Lighting' },
  { id: 7619, key: 'AUDIO', name: 'Audio' },
];

export function RunsheetTableEditor({
  channelId,
  channelName,
  columns = FALLBACK_COLUMNS,
  initialItems,
  initialStartTime = '09:00:00 AM',
}: RunsheetTableEditorProps) {
  const [items, setItems] = useState<RunsheetItemRow[]>(initialItems);
  const [deletedIds, setDeletedIds] = useState<(number | string)[]>([]);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Filter out ACTIVITYTITLE attribute column from dynamic loop since Activity Title replaces the Title column directly
  const dynamicAttrCols = useMemo(() => {
    const list = columns && columns.length > 0 ? columns : FALLBACK_COLUMNS;
    return list.filter((col) => col.key !== 'ACTIVITYTITLE' && col.key !== 'ACTIVITY TITLE' && col.key !== 'TITLE');
  }, [columns]);

  // Active editing state for general cells { rowIndex, key }
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; key: string } | null>(null);

  // Active editing state for a merged duration block (stores blockStartIndex)
  const [editingDurationBlockIndex, setEditingDurationBlockIndex] = useState<number | null>(null);
  const [durationDrafts, setDurationDrafts] = useState<{ [index: number]: string }>({});

  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });

  // Calculate Start, End, and Duration vertical cell merging across 0-duration sub-items
  const { processedRows, timeSpanMap, parentBlockMap } = useMemo(() => {
    let currentMinutes = parseTimeToMinutes(startTime);
    const timeSpanMap: { [startIndex: number]: { count: number; startStr: string; endStr: string; formattedDuration: string } } = {};
    const parentBlockMap: { [itemIndex: number]: number } = {};
    const processed: (RunsheetItemRow & { calculatedStart: string; calculatedEnd: string; formattedDuration: string })[] = [];

    let i = 0;
    while (i < items.length) {
      const item = items[i];
      const duration = Number(item.duration) || 0;

      if (duration > 0) {
        const blockStartIndex = i;
        const startStr = formatMinutesToTimeWithSeconds(currentMinutes);
        currentMinutes += duration;
        const endStr = formatMinutesToTimeWithSeconds(currentMinutes);
        const durStr = formatDurationToHMS(duration);

        processed.push({
          ...item,
          order: i + 1,
          calculatedStart: startStr,
          calculatedEnd: endStr,
          formattedDuration: durStr,
        });
        parentBlockMap[i] = blockStartIndex;
        i++;

        // Collect all subsequent 0-duration sub-items into this block
        while (i < items.length && (Number(items[i].duration) || 0) === 0) {
          processed.push({
            ...items[i],
            order: i + 1,
            calculatedStart: startStr,
            calculatedEnd: endStr,
            formattedDuration: '',
          });
          parentBlockMap[i] = blockStartIndex;
          i++;
        }

        const count = i - blockStartIndex;
        timeSpanMap[blockStartIndex] = { count, startStr, endStr, formattedDuration: durStr };
      } else {
        // Initial block of items with duration == 0
        const blockStartIndex = i;
        const startStr = formatMinutesToTimeWithSeconds(currentMinutes);
        const endStr = startStr;

        while (i < items.length && (Number(items[i].duration) || 0) === 0) {
          processed.push({
            ...items[i],
            order: i + 1,
            calculatedStart: startStr,
            calculatedEnd: endStr,
            formattedDuration: '',
          });
          parentBlockMap[i] = blockStartIndex;
          i++;
        }

        const count = i - blockStartIndex;
        timeSpanMap[blockStartIndex] = { count, startStr, endStr, formattedDuration: '' };
      }
    }

    return { processedRows: processed, timeSpanMap, parentBlockMap };
  }, [items, startTime]);

  const handleAttrValueChange = (index: number, key: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index] };

    if (key === 'title' || key === 'ACTIVITYTITLE') {
      item.title = value;
      item.attributeValues = {
        ...(item.attributeValues || {}),
        ACTIVITYTITLE: value,
      };
    } else {
      item.attributeValues = {
        ...(item.attributeValues || {}),
        [key]: value,
      };

      // Sync backward compatibility fields
      if (key === 'DESCRIPTION' || key === 'DETIAL') item.detail = value;
      else if (key === 'PLATFORM' || key === 'ANCHORPREACHER') item.anchorPreacher = value;
      else if (key === 'MAININSTRUMENT') item.mainInstrument = value;
      else if (key === 'LED WALL' || key === 'LEDLIVESCREENS') item.ledLiveScreens = value;
      else if (key === 'AUDIO') item.audio = value;
    }

    updated[index] = item;
    setItems(updated);
    setIsDirty(true);
  };

  const handleCommitDurationDrafts = () => {
    if (editingDurationBlockIndex === null) return;
    const updated = [...items];
    Object.entries(durationDrafts).forEach(([idxStr, draftVal]) => {
      const idx = parseInt(idxStr, 10);
      const mins = parseDurationInputToMinutes(draftVal);
      updated[idx] = {
        ...updated[idx],
        duration: mins,
      };
    });
    setItems(updated);
    setIsDirty(true);
    setEditingDurationBlockIndex(null);
    setDurationDrafts({});
  };

  const handleAddRow = () => {
    const tempId = `new_${Date.now()}`;
    const newRow: RunsheetItemRow = {
      id: tempId,
      isNew: true,
      title: 'New Segment',
      order: items.length + 1,
      duration: 5,
      attributeValues: {
        ACTIVITYTITLE: 'New Segment',
      },
      detail: '',
      anchorPreacher: '',
      mainInstrument: '',
      ledLiveScreens: '',
      overlayBroadcast: '',
      lighting: '',
      audio: '',
    };
    const newItems = [...items, newRow];
    setItems(newItems);
    setIsDirty(true);
    setEditingCell({ rowIndex: newItems.length - 1, key: 'title' });
  };

  const handleLoadDefaultTemplate = () => {
    const templateRows: RunsheetItemRow[] = DEFAULT_RUNSHEET_TEMPLATE.map((row, idx) => ({
      id: `tmpl_${idx}_${Date.now()}`,
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

    const existingIds = items.map((i) => i.id);
    setDeletedIds((prev) => [...prev, ...existingIds]);

    setItems(templateRows);
    setIsDirty(true);
    setStatus({ type: 'idle' });
  };

  const handleDeleteRow = (id: number | string) => {
    setDeletedIds([...deletedIds, id]);
    setItems(items.filter((item) => item.id !== id));
    setIsDirty(true);
  };

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index);
    const rowElement = e.currentTarget.closest('tr');
    if (rowElement && e.dataTransfer) {
      e.dataTransfer.setDragImage(rowElement, 20, 20);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const updated = [...items];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setItems(updated);
    setDraggedIndex(null);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setStatus({ type: 'saving' });

    const preparedItems = processedRows.map((row) => ({
      ...row,
      startDateTime: row.calculatedStart,
    }));

    const res = await rockBulkSaveRunsheetItems(channelId, preparedItems, deletedIds, columns);

    if (res.success) {
      setStatus({ type: 'success', message: 'Favor Runsheet successfully saved to Rock RMS!' });
      setIsDirty(false);
      setDeletedIds([]);
    } else {
      setStatus({ type: 'error', message: res.error || 'Failed to save changes.' });
    }
  };

  const applyFormatting = (index: number, key: string, tag: '**' | '*' | '~~') => {
    const input = document.getElementById(`cell-input-${index}-${key}`) as HTMLInputElement | HTMLTextAreaElement;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentVal = key === 'title' ? items[index].title : (items[index].attributeValues?.[key] ?? '');
      const selectedText = currentVal.substring(start, end);
      let newVal = '';
      if (selectedText) {
        newVal = currentVal.substring(0, start) + `${tag}${selectedText}${tag}` + currentVal.substring(end);
      } else {
        newVal = currentVal + (tag === '**' ? '**bold**' : '~~italic~~');
      }
      handleAttrValueChange(index, key, newVal);

      setTimeout(() => {
        if (selectedText) {
          input.selectionStart = start + tag.length;
          input.selectionEnd = end + tag.length;
        } else {
          input.selectionStart = input.selectionEnd = start + tag.length;
        }
      }, 0);
    }
  };

  const renderCellContent = (
    index: number,
    key: string,
    value: any,
    isPersonField = false
  ) => {
    const isEditing = editingCell?.rowIndex === index && editingCell?.key === key;

    if (isEditing) {
      if (isPersonField) {
        return (
          <PeopleSearchDropdown
            initialValue={value ?? ''}
            onSelectPerson={(selectedName) => handleAttrValueChange(index, key, selectedName)}
            onClose={() => setEditingCell(null)}
          />
        );
      }

      const lineCount = String(value || '').split('\n').length;

      return (
        <div className="relative flex items-start w-full">
          <textarea
            id={`cell-input-${index}-${key}`}
            autoFocus
            ref={(el) => {
              if (el) {
                const len = el.value.length;
                el.setSelectionRange(len, len);
              }
            }}
            rows={Math.max(2, lineCount)}
            className="w-full bg-white px-2 py-1 pr-14 border border-pink-600 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-600 text-xs font-medium resize-y min-h-[36px]"
            value={value ?? ''}
            onChange={(e) => handleAttrValueChange(index, key, e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                applyFormatting(index, key, '**');
                return;
              }
              
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                applyFormatting(index, key, '~~');
                return;
              }

              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                const textarea = e.currentTarget;
                const start = textarea.selectionStart || 0;
                const end = textarea.selectionEnd || 0;
                const currentVal = value ?? '';
                const newVal = currentVal.substring(0, start) + '\n' + currentVal.substring(end);
                handleAttrValueChange(index, key, newVal);

                setTimeout(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + 1;
                }, 0);
                return;
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const textarea = e.currentTarget;
                const pos = textarea.selectionStart || 0;
                const currentVal = value ?? '';

                const textBefore = currentVal.substring(0, pos);
                const textAfter = currentVal.substring(pos);

                const doubleStarBefore = (textBefore.match(/\*\*/g) || []).length;
                const tildeBefore = (textBefore.match(/~~/g) || []).length;

                const insideBold = doubleStarBefore % 2 === 1 && textAfter.includes('**');
                const insideItalic = tildeBefore % 2 === 1 && textAfter.includes('~~');

                if (insideBold) {
                  const nextClose = currentVal.indexOf('**', pos);
                  if (nextClose !== -1) {
                    textarea.selectionStart = textarea.selectionEnd = nextClose + 2;
                    return;
                  }
                }

                if (insideItalic) {
                  const nextClose = currentVal.indexOf('~~', pos);
                  if (nextClose !== -1) {
                    textarea.selectionStart = textarea.selectionEnd = nextClose + 2;
                    return;
                  }
                }

                setEditingCell(null);
              }
            }}
          />
          <div className="absolute right-1 top-1 flex items-center gap-0.5 select-none bg-white/90 rounded px-0.5 shadow-xs border border-slate-200">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormatting(index, key, '**');
              }}
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded px-1 text-[11px] font-bold cursor-pointer"
              title="Bold (Cmd+B / Ctrl+B)"
            >
              B
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormatting(index, key, '~~');
              }}
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded px-1 text-[11px] italic font-serif cursor-pointer"
              title="Italics (Cmd+I / Ctrl+I)"
            >
              I
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        onDoubleClick={() => setEditingCell({ rowIndex: index, key })}
        className="w-full min-h-[24px] px-2 py-1 cursor-pointer text-slate-900 rounded hover:bg-slate-100/80 transition-colors select-none whitespace-pre-wrap break-words"
        title="Double click to edit (Cmd+Enter line break, Enter finish or exit tag)"
      >
        {value ? (
          <div>{renderFormattedText(String(value))}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-5 shadow-sm w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{channelName}</h2>
          <p className="text-xs text-slate-500 font-medium">
            Channel ID: {channelId} • Favor Runsheet Studio • Activity Title as Segment Title
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Start:
            </label>
            <input
              type="text"
              className="w-24 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setIsDirty(true);
              }}
              placeholder="09:00:00 AM"
            />
          </div>

          <button
            onClick={handleLoadDefaultTemplate}
            className="flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100 cursor-pointer min-h-[36px]"
            title="Load standard 18-row Favor Runsheet template"
          >
            <HiSparkles className="h-4 w-4 text-purple-600" />
            <span>Load Template</span>
          </button>

          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 cursor-pointer min-h-[36px]"
          >
            <HiPlus className="h-4 w-4 text-blue-600" />
            <span>Add Row</span>
          </button>

          <button
            onClick={handleSave}
            disabled={status.type === 'saving' || !isDirty}
            className="flex items-center gap-1.5 rounded-lg bg-pink-700 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-800 active:bg-pink-900 focus:outline-none disabled:opacity-40 cursor-pointer min-h-[36px]"
          >
            <HiCheck className="h-4 w-4" />
            <span>{status.type === 'saving' ? 'Saving...' : 'Save Runsheet'}</span>
          </button>
        </div>
      </div>

      {/* Alert Status */}
      {status.type === 'success' && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
          <HiCheck className="h-4 w-4 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'error' && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 border border-rose-200">
          <HiExclamationCircle className="h-4 w-4 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      {/* Full-Width Dynamic Rock RMS Spreadsheet Table */}
      <div className="w-full rounded-lg border border-slate-300 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-xs text-slate-900" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-900 font-bold text-left">
              <th className="p-1.5 border-r border-slate-300 text-center" style={{ width: '2.5%' }}></th>
              <th className="p-2 border-r border-slate-300 font-bold text-center" style={{ width: '7%' }}>Start</th>
              <th className="p-2 border-r border-slate-300 font-bold text-center" style={{ width: '7%' }}>End</th>
              <th className="p-2 border-r border-slate-300 font-bold text-center" style={{ width: '7%' }}>Duration</th>
              
              {/* Activity Title replaces Title column entirely */}
              <th className="p-2 border-r border-slate-300 font-bold" style={{ width: '15%' }}>Activity Title</th>

              {/* Other Dynamic Rock RMS Attribute Columns */}
              {dynamicAttrCols.map((col) => (
                <th key={col.id} className="p-2 border-r border-slate-300 font-bold">
                  {col.name}
                </th>
              ))}

              <th className="p-1.5 text-center" style={{ width: '3%' }}></th>
            </tr>
          </thead>
          <tbody>
            {processedRows.map((item, index) => {
              const spanInfo = timeSpanMap[index];
              const parentBlockIndex = parentBlockMap[index];
              const isDragOver = draggedIndex === index;

              const isBlockEditing = editingDurationBlockIndex === parentBlockIndex;
              const currentTitleVal = item.attributeValues?.['ACTIVITYTITLE'] || item.title || '';

              return (
                <tr
                  key={item.id}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`border-b border-slate-200 hover:bg-slate-50/90 transition-colors ${
                    isDragOver ? 'bg-blue-50 border-t-2 border-blue-500' : ''
                  }`}
                >
                  {/* Left-Most Drag Handle Cell */}
                  <td
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    className="p-1 border-r border-slate-200 text-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 select-none"
                    title="Drag handle cell to move whole row"
                  >
                    <HiBars3 className="h-5 w-5 mx-auto pointer-events-none" />
                  </td>

                  {/* Vertically Merged Unformatted Start Cell */}
                  {spanInfo ? (
                    <td
                      rowSpan={spanInfo.count}
                      className="p-2 border-r border-b border-slate-300 font-mono font-semibold text-slate-800 text-center bg-slate-50/90 align-middle select-none"
                    >
                      {spanInfo.startStr}
                    </td>
                  ) : null}

                  {/* Vertically Merged Unformatted End Cell */}
                  {spanInfo ? (
                    <td
                      rowSpan={spanInfo.count}
                      className="p-2 border-r border-b border-slate-300 font-mono font-semibold text-slate-700 text-center bg-slate-50/90 align-middle select-none"
                    >
                      {spanInfo.endStr}
                    </td>
                  ) : null}

                  {/* Duration Cell Behavior */}
                  {!isBlockEditing ? (
                    spanInfo ? (
                      <td
                        rowSpan={spanInfo.count}
                        onDoubleClick={() => {
                          const drafts: { [idx: number]: string } = {};
                          for (let i = parentBlockIndex; i < parentBlockIndex + spanInfo.count; i++) {
                            const dMins = Number(items[i].duration) || 0;
                            drafts[i] = formatDurationToHMS(dMins);
                          }
                          setDurationDrafts(drafts);
                          setEditingDurationBlockIndex(parentBlockIndex);
                        }}
                        className="p-2 border-r border-b border-slate-300 font-mono font-semibold text-slate-800 text-center bg-slate-50/90 align-middle cursor-pointer hover:bg-slate-200/60 select-none"
                        title="Double click to split & edit duration for sub-rows in this block"
                      >
                        {spanInfo.formattedDuration || '-'}
                      </td>
                    ) : null
                  ) : (
                    <td className="p-1 border-r border-b border-slate-200 text-center bg-slate-100">
                      <input
                        type="text"
                        autoFocus={index === parentBlockIndex}
                        onFocus={(e) => {
                          const len = e.currentTarget.value.length;
                          e.currentTarget.setSelectionRange(len, len);
                        }}
                        className="w-20 bg-white text-center px-1 py-0.5 border border-pink-600 rounded text-slate-900 font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-pink-600 text-xs"
                        value={durationDrafts[index] ?? '00:00:00'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDurationDrafts((prev) => ({ ...prev, [index]: val }));
                        }}
                        onBlur={(e) => {
                          if (e.relatedTarget && (e.relatedTarget as HTMLElement).tagName === 'INPUT') {
                            return;
                          }
                          handleCommitDurationDrafts();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            handleCommitDurationDrafts();
                          }
                        }}
                        placeholder="00:00:00"
                      />
                    </td>
                  )}

                  {/* Activity Title Column (replaces Title column entirely, exact same size 15%) */}
                  <td className="p-1 border-r border-slate-200">
                    {renderCellContent(index, 'title', currentTitleVal)}
                  </td>

                  {/* Dynamic Rock RMS Attribute Columns */}
                  {dynamicAttrCols.map((col) => {
                    let val = item.attributeValues?.[col.key];
                    if (val === undefined) {
                      if (col.key === 'DESCRIPTION' || col.key === 'DETIAL') val = item.detail;
                      else if (col.key === 'PLATFORM' || col.key === 'ANCHORPREACHER') val = item.anchorPreacher;
                      else if (col.key === 'MAININSTRUMENT') val = item.mainInstrument;
                      else if (col.key === 'LED WALL' || col.key === 'LEDLIVESCREENS') val = item.ledLiveScreens;
                      else if (col.key === 'AUDIO') val = item.audio;
                    }

                    const isPersonField =
                      col.fieldTypeId === 18 ||
                      col.key.toUpperCase().includes('PLATFORM') ||
                      col.key.toUpperCase().includes('ANCHOR') ||
                      col.key.toUpperCase().includes('PREACHER');

                    return (
                      <td key={col.id} className="p-1 border-r border-slate-200">
                        {renderCellContent(index, col.key, val ?? '', isPersonField)}
                      </td>
                    );
                  })}

                  {/* Actions */}
                  <td className="p-1 text-center">
                    <button
                      onClick={() => handleDeleteRow(item.id)}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 cursor-pointer min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                      title="Delete Segment"
                    >
                      <HiTrash className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
