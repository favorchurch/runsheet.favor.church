'use client';

import type { Editor } from '@tiptap/react';
import React, { useMemo, useState } from 'react';
import { HiBars3, HiCheck, HiExclamationCircle, HiLockClosed, HiPlus, HiSparkles, HiTrash } from 'react-icons/hi2';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';
import {
  FALLBACK_RUNSHEET_COLUMNS,
  isPersonColumn,
  readRunsheetCellValue,
  RESERVED_RUNSHEET_COLUMN_KEYS,
  writeRunsheetCellValue,
} from '@/constants/runsheetColumns';
import {
  formatDurationToHMS,
  formatMinutesToTimeWithSeconds,
  parseDurationInputToMinutes,
  parseTimeToMinutes,
} from '@/lib/runsheetTime';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';
import { PeopleSearchDropdown } from './PeopleSearchDropdown';
import { CELL_ATTRIBUTE, RichTextCell } from './RichTextCell';
import { RichTextContent } from './RichTextContent';
import { RichTextToolbar } from './RichTextToolbar';

interface RunsheetTableEditorProps {
  channelId: number;
  channelName: string;
  columns?: DynamicAttributeColumn[];
  initialItems: RunsheetItemRow[];
  initialStartTime?: string;
  readOnly?: boolean;
}

/** A row plus the clock values derived from the durations above it. */
type ProcessedRow = RunsheetItemRow & {
  calculatedStart: string;
  calculatedEnd: string;
  formattedDuration: string;
};

/** Start/End/Duration cells are merged across a block of rows via `rowSpan`. */
interface TimeSpan {
  count: number;
  startStr: string;
  endStr: string;
  formattedDuration: string;
}

export function RunsheetTableEditor({
  channelId,
  channelName,
  columns = FALLBACK_RUNSHEET_COLUMNS,
  initialItems,
  initialStartTime = '09:00:00 AM',
  readOnly = false,
}: RunsheetTableEditorProps) {
  const [items, setItems] = useState<RunsheetItemRow[]>(initialItems);
  const [deletedIds, setDeletedIds] = useState<(number | string)[]>([]);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  /** The cell currently open for editing. */
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; key: string } | null>(null);

  /**
   * Editor behind the open cell, lifted so the one formatting bar above the
   * grid can drive it — the columns are far too narrow for per-cell toolbars.
   */
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  /** Duration edits happen per merged block, so drafts are keyed by row index. */
  const [editingDurationBlockIndex, setEditingDurationBlockIndex] = useState<number | null>(null);
  const [durationDrafts, setDurationDrafts] = useState<{ [index: number]: string }>({});

  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });

  // The activity title has its own column, so it is dropped from the dynamic loop.
  const dynamicAttrCols = useMemo(() => {
    const list = columns && columns.length > 0 ? columns : FALLBACK_RUNSHEET_COLUMNS;
    return list.filter((col) => !RESERVED_RUNSHEET_COLUMN_KEYS.includes(col.key));
  }, [columns]);

  /**
   * Walks the rows in order, accumulating the clock and grouping each timed row
   * with the zero-duration rows that follow it. Those groups become the merged
   * Start/End/Duration cells: a segment with sub-items shows one time span.
   */
  const { processedRows, timeSpanMap, parentBlockMap } = useMemo(() => {
    let currentMinutes = parseTimeToMinutes(startTime);
    const spans: { [startIndex: number]: TimeSpan } = {};
    const parents: { [itemIndex: number]: number } = {};
    const processed: ProcessedRow[] = [];

    let index = 0;
    while (index < items.length) {
      const blockStartIndex = index;
      const duration = Number(items[index].duration) || 0;
      const startStr = formatMinutesToTimeWithSeconds(currentMinutes);

      if (duration > 0) {
        currentMinutes += duration;
        const endStr = formatMinutesToTimeWithSeconds(currentMinutes);
        const durStr = formatDurationToHMS(duration);

        processed.push({
          ...items[index],
          order: index + 1,
          calculatedStart: startStr,
          calculatedEnd: endStr,
          formattedDuration: durStr,
        });
        parents[index] = blockStartIndex;
        index++;

        // Zero-duration rows are sub-items of the segment above them.
        while (index < items.length && (Number(items[index].duration) || 0) === 0) {
          processed.push({
            ...items[index],
            order: index + 1,
            calculatedStart: startStr,
            calculatedEnd: endStr,
            formattedDuration: '',
          });
          parents[index] = blockStartIndex;
          index++;
        }

        spans[blockStartIndex] = { count: index - blockStartIndex, startStr, endStr, formattedDuration: durStr };
      } else {
        // Leading zero-duration rows have no segment to attach to.
        while (index < items.length && (Number(items[index].duration) || 0) === 0) {
          processed.push({
            ...items[index],
            order: index + 1,
            calculatedStart: startStr,
            calculatedEnd: startStr,
            formattedDuration: '',
          });
          parents[index] = blockStartIndex;
          index++;
        }

        spans[blockStartIndex] = {
          count: index - blockStartIndex,
          startStr,
          endStr: startStr,
          formattedDuration: '',
        };
      }
    }

    return { processedRows: processed, timeSpanMap: spans, parentBlockMap: parents };
  }, [items, startTime]);

  const handleAttrValueChange = (index: number, key: string, value: string) => {
    if (readOnly) return;
    setItems((previous) => {
      const updated = [...previous];
      const item = { ...updated[index] };

      if (key === 'title' || key === 'ACTIVITYTITLE') {
        item.title = value;
        item.attributeValues = { ...(item.attributeValues || {}), ACTIVITYTITLE: value };
      } else {
        writeRunsheetCellValue(item, key, value);
      }

      updated[index] = item;
      return updated;
    });

    setIsDirty(true);
  };

  const handleCommitDurationDrafts = () => {
    if (readOnly || editingDurationBlockIndex === null) return;

    setItems((previous) => {
      const updated = [...previous];
      Object.entries(durationDrafts).forEach(([indexStr, draft]) => {
        const index = parseInt(indexStr, 10);
        if (!updated[index]) return;
        updated[index] = { ...updated[index], duration: parseDurationInputToMinutes(draft) };
      });
      return updated;
    });

    setIsDirty(true);
    setEditingDurationBlockIndex(null);
    setDurationDrafts({});
  };

  const handleAddRow = () => {
    if (readOnly) return;
    const newRow: RunsheetItemRow = {
      id: `new_${Date.now()}`,
      isNew: true,
      title: 'New Segment',
      order: items.length + 1,
      duration: 5,
      attributeValues: { ACTIVITYTITLE: 'New Segment' },
      detail: '',
      anchorPreacher: '',
      mainInstrument: '',
      ledLiveScreens: '',
      overlayBroadcast: '',
      lighting: '',
      audio: '',
    };

    setItems((previous) => [...previous, newRow]);
    setIsDirty(true);
    setEditingCell({ rowIndex: items.length, key: 'title' });
  };

  const handleLoadDefaultTemplate = () => {
    if (readOnly) return;
    const templateRows: RunsheetItemRow[] = DEFAULT_RUNSHEET_TEMPLATE.map((row, index) => ({
      id: `tmpl_${index}_${Date.now()}`,
      isNew: true,
      title: row.title,
      duration: row.duration,
      attributeValues: {
        ACTIVITYTITLE: row.activityTitle || row.title,
        DESCRIPTION: row.detail,
        DETIAL: row.detail,
      },
      detail: row.detail,
      order: index + 1,
      anchorPreacher: '',
      mainInstrument: '',
      ledLiveScreens: '',
      overlayBroadcast: '',
      lighting: '',
      audio: '',
    }));

    setDeletedIds((previous) => [...previous, ...items.map((item) => item.id)]);
    setItems(templateRows);
    setEditingCell(null);
    setIsDirty(true);
    setStatus({ type: 'idle' });
  };

  const handleDeleteRow = (id: number | string) => {
    if (readOnly) return;
    setDeletedIds((previous) => [...previous, id]);
    setItems((previous) => previous.filter((item) => item.id !== id));
    setEditingCell(null);
    setIsDirty(true);
  };

  const handleDragStart = (index: number, event: React.DragEvent) => {
    if (readOnly) return;
    setDraggedIndex(index);
    const rowElement = event.currentTarget.closest('tr');
    if (rowElement && event.dataTransfer) {
      event.dataTransfer.setDragImage(rowElement, 20, 20);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (readOnly || draggedIndex === null || draggedIndex === targetIndex) return;

    setItems((previous) => {
      const updated = [...previous];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });

    setDraggedIndex(null);
    setEditingCell(null);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (readOnly) return;
    setStatus({ type: 'saving' });
    setEditingCell(null);

    const preparedItems = processedRows.map((row) => ({ ...row, startDateTime: row.calculatedStart }));
    const result = await rockBulkSaveRunsheetItems(channelId, preparedItems, deletedIds, columns);

    if (result.success) {
      setStatus({ type: 'success', message: 'Favor Runsheet successfully saved to Rock RMS!' });
      setIsDirty(false);
      setDeletedIds([]);
    } else {
      setStatus({ type: 'error', message: result.error || 'Failed to save changes.' });
    }
  };

  const closeCell = (index: number, key: string) => {
    setEditingCell((current) => (current?.rowIndex === index && current?.key === key ? null : current));
  };

  const renderCellContent = (index: number, key: string, value: string, isPersonField = false) => {
    const isEditing = !readOnly && editingCell?.rowIndex === index && editingCell?.key === key;

    if (isEditing) {
      if (isPersonField) {
        return (
          <PeopleSearchDropdown
            initialValue={value ?? ''}
            onSelectPerson={(selectedName) => handleAttrValueChange(index, key, selectedName)}
            onClose={() => closeCell(index, key)}
          />
        );
      }

      return (
        <RichTextCell
          value={value ?? ''}
          onChange={(html) => handleAttrValueChange(index, key, html)}
          onCommit={() => closeCell(index, key)}
          onEditorChange={setActiveEditor}
        />
      );
    }

    return (
      <div
        {...{ [CELL_ATTRIBUTE]: '' }}
        onMouseDown={(event) => {
          if (readOnly) return;
          event.preventDefault();
          setEditingCell({ rowIndex: index, key });
        }}
        className={`min-h-[24px] w-full rounded px-2 py-1 text-slate-900 transition-colors ${
          readOnly ? 'cursor-default' : 'cursor-text hover:bg-slate-100/80'
        }`}
        title={
          readOnly
            ? 'Read-only volunteer view'
            : isPersonField
            ? 'Click to search Rock for a person'
            : 'Click to edit'
        }
      >
        <RichTextContent value={value ?? ''} />
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">{channelName}</h2>
            {readOnly && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900 border border-amber-300 shadow-xs">
                <HiLockClosed className="h-3.5 w-3.5 text-amber-700" />
                Read Only (Volunteer Access)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
            <label className="whitespace-nowrap text-xs font-semibold text-slate-700" htmlFor="runsheet-start-time">
              Start:
            </label>
            <input
              id="runsheet-start-time"
              type="text"
              disabled={readOnly}
              className="w-24 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
              value={startTime}
              onChange={(event) => {
                setStartTime(event.target.value);
                setIsDirty(true);
              }}
              placeholder="09:00:00 AM"
            />
          </div>

          {!readOnly && (
            <>
              <button
                onClick={handleLoadDefaultTemplate}
                className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100"
                title="Load standard Favor Runsheet template"
              >
                <HiSparkles className="h-4 w-4 text-purple-600" />
                <span>Load Template</span>
              </button>

              <button
                onClick={handleAddRow}
                className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100"
              >
                <HiPlus className="h-4 w-4 text-blue-600" />
                <span>Add Row</span>
              </button>

              <button
                onClick={handleSave}
                disabled={status.type === 'saving' || !isDirty}
                className="flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg bg-pink-700 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-800 focus:outline-none active:bg-pink-900 disabled:opacity-40"
              >
                <HiCheck className="h-4 w-4" />
                <span>{status.type === 'saving' ? 'Saving...' : 'Save Runsheet'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Formatting bar for whichever cell is open (hidden in read-only mode) */}
      {!readOnly && <RichTextToolbar editor={activeEditor} />}

      {status.type === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          <HiCheck className="h-4 w-4 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          <HiExclamationCircle className="h-4 w-4 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-lg border border-slate-300">
        <table className="w-full border-collapse bg-white text-xs text-slate-900" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100 text-left font-bold text-slate-900">
              {!readOnly && <th className="border-r border-slate-300 p-1.5 text-center" style={{ width: '2.5%' }} />}
              <th className="border-r border-slate-300 p-2 text-center font-bold" style={{ width: '7%' }}>
                Start
              </th>
              <th className="border-r border-slate-300 p-2 text-center font-bold" style={{ width: '7%' }}>
                End
              </th>
              <th className="border-r border-slate-300 p-2 text-center font-bold" style={{ width: '7%' }}>
                Duration
              </th>
              <th className="border-r border-slate-300 p-2 font-bold" style={{ width: '15%' }}>
                Activity Title
              </th>

              {dynamicAttrCols.map((col) => (
                <th key={col.id} className="border-r border-slate-300 p-2 font-bold">
                  {col.name}
                </th>
              ))}

              {!readOnly && <th className="p-1.5 text-center" style={{ width: '3%' }} />}
            </tr>
          </thead>
          <tbody>
            {processedRows.map((item, index) => {
              const spanInfo = timeSpanMap[index];
              const parentBlockIndex = parentBlockMap[index];
              const isDragOver = draggedIndex === index;
              const isBlockEditing = !readOnly && editingDurationBlockIndex === parentBlockIndex;
              const currentTitleVal = item.attributeValues?.ACTIVITYTITLE || item.title || '';

              return (
                <tr
                  key={item.id}
                  onDragOver={(event) => !readOnly && event.preventDefault()}
                  onDrop={() => !readOnly && handleDrop(index)}
                  className={`border-b border-slate-200 transition-colors hover:bg-slate-50/90 ${
                    isDragOver ? 'border-t-2 border-blue-500 bg-blue-50' : ''
                  }`}
                >
                  {!readOnly && (
                    <td
                      draggable
                      onDragStart={(event) => handleDragStart(index, event)}
                      className="cursor-grab select-none border-r border-slate-200 p-1 text-center text-slate-400 hover:text-slate-700 active:cursor-grabbing"
                      title="Drag handle cell to move whole row"
                    >
                      <HiBars3 className="mx-auto h-5 w-5 pointer-events-none" />
                    </td>
                  )}

                  {spanInfo ? (
                    <td
                      rowSpan={spanInfo.count}
                      className="select-none border-b border-r border-slate-300 bg-slate-50/90 p-2 text-center align-middle font-mono font-semibold text-slate-800"
                    >
                      {spanInfo.startStr}
                    </td>
                  ) : null}

                  {spanInfo ? (
                    <td
                      rowSpan={spanInfo.count}
                      className="select-none border-b border-r border-slate-300 bg-slate-50/90 p-2 text-center align-middle font-mono font-semibold text-slate-700"
                    >
                      {spanInfo.endStr}
                    </td>
                  ) : null}

                  {!isBlockEditing ? (
                    spanInfo ? (
                      <td
                        rowSpan={spanInfo.count}
                        onDoubleClick={() => {
                          if (readOnly) return;
                          const drafts: { [index: number]: string } = {};
                          for (let i = parentBlockIndex; i < parentBlockIndex + spanInfo.count; i++) {
                            drafts[i] = formatDurationToHMS(Number(items[i].duration) || 0);
                          }
                          setDurationDrafts(drafts);
                          setEditingDurationBlockIndex(parentBlockIndex);
                        }}
                        className={`select-none border-b border-r border-slate-300 bg-slate-50/90 p-2 text-center align-middle font-mono font-semibold text-slate-800 ${
                          readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/60'
                        }`}
                        title={readOnly ? 'Duration' : 'Double click to split & edit duration for sub-rows in this block'}
                      >
                        {spanInfo.formattedDuration || '-'}
                      </td>
                    ) : null
                  ) : (
                    <td className="border-b border-r border-slate-200 bg-slate-100 p-1 text-center">
                      <input
                        type="text"
                        autoFocus={index === parentBlockIndex}
                        onFocus={(event) => {
                          const end = event.currentTarget.value.length;
                          event.currentTarget.setSelectionRange(end, end);
                        }}
                        className="w-20 rounded border border-pink-600 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-600"
                        value={durationDrafts[index] ?? '00:00:00'}
                        onChange={(event) =>
                          setDurationDrafts((previous) => ({ ...previous, [index]: event.target.value }))
                        }
                        onBlur={(event) => {
                          if ((event.relatedTarget as HTMLElement | null)?.tagName === 'INPUT') return;
                          handleCommitDurationDrafts();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === 'Escape') handleCommitDurationDrafts();
                        }}
                        placeholder="00:00:00"
                      />
                    </td>
                  )}

                  <td className="border-r border-slate-200 p-1 align-top">
                    {renderCellContent(index, 'title', currentTitleVal)}
                  </td>

                  {dynamicAttrCols.map((col) => (
                    <td key={col.id} className="border-r border-slate-200 p-1 align-top">
                      {renderCellContent(index, col.key, readRunsheetCellValue(item, col.key), isPersonColumn(col))}
                    </td>
                  ))}

                  {!readOnly && (
                    <td className="p-1 text-center">
                      <button
                        onClick={() => handleDeleteRow(item.id)}
                        className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded p-1.5 text-red-600 hover:bg-red-50"
                        title="Delete Segment"
                      >
                        <HiTrash className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
