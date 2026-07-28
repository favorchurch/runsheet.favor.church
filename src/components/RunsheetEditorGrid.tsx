'use client';

import React, { useState, useMemo } from 'react';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { RunsheetItemRow } from '@/server-actions/rockGetRunsheetDetails';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { HiPlus, HiTrash, HiBars3, HiCheck, HiExclamationCircle } from 'react-icons/hi2';

interface RunsheetEditorGridProps {
  channelId: number;
  channelName: string;
  initialItems: RunsheetItemRow[];
  initialStartTime?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 9 * 60;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  return `${hours12}:${minsStr} ${period}`;
}

export function RunsheetEditorGrid({
  channelId,
  channelName,
  initialItems,
  initialStartTime = '09:30 AM',
}: RunsheetEditorGridProps) {
  const [items, setItems] = useState<RunsheetItemRow[]>(initialItems);
  const [deletedIds, setDeletedIds] = useState<(number | string)[]>([]);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });

  const calculatedRows = useMemo(() => {
    let currentCumulativeMinutes = parseTimeToMinutes(startTime);

    const rawRows = items.map((item, index) => {
      const rowStartTime = formatMinutesToTime(currentCumulativeMinutes);
      const itemDuration = Number(item.duration) || 0;
      currentCumulativeMinutes += itemDuration;
      return {
        ...item,
        order: index + 1,
        calculatedStartTime: rowStartTime,
      };
    });

    return rawRows.map((row, index) => {
      const prevRow = rawRows[index - 1];
      const nextRow = rawRows[index + 1];

      const isGroupStart = !prevRow || prevRow.calculatedStartTime !== row.calculatedStartTime;
      const isGroupEnd = !nextRow || nextRow.calculatedStartTime !== row.calculatedStartTime;

      return {
        ...row,
        isTimeGroupStart: isGroupStart,
        isTimeGroupEnd: isGroupEnd,
      };
    });
  }, [items, startTime]);

  const handleProcessRowUpdate = (newRow: any) => {
    const updated = items.map((row) => (row.id === newRow.id ? { ...newRow, isDirty: true } : row));
    setItems(updated);
    setIsDirty(true);
    return newRow;
  };

  const handleAddRow = () => {
    const tempId = `new_${Date.now()}`;
    const newRow: RunsheetItemRow = {
      id: tempId,
      isNew: true,
      title: 'New Segment',
      order: items.length + 1,
      duration: 5,
      detail: '',
      anchorPreacher: '',
      mainInstrument: '',
      ledLiveScreens: '',
      overlayBroadcast: '',
      lighting: '',
      audio: '',
    };
    setItems([...items, newRow]);
    setIsDirty(true);
  };

  const handleDeleteRow = (id: number | string) => {
    setDeletedIds([...deletedIds, id]);
    setItems(items.filter((item) => item.id !== id));
    setIsDirty(true);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
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

    const preparedItems = calculatedRows.map((row) => ({
      ...row,
      startDateTime: row.calculatedStartTime,
    }));

    const res = await rockBulkSaveRunsheetItems(channelId, preparedItems, deletedIds);

    if (res.success) {
      setStatus({ type: 'success', message: 'Runsheet successfully saved to Rock RMS!' });
      setIsDirty(false);
      setDeletedIds([]);
    } else {
      setStatus({ type: 'error', message: res.error || 'Failed to save changes.' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'dragHandle',
      headerName: '',
      width: 40,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const index = calculatedRows.findIndex((r) => r.id === params.id);
        return (
          <div
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700"
            title="Drag to reorder segment"
          >
            <HiBars3 className="h-5 w-5" />
          </div>
        );
      },
    },
    {
      field: 'calculatedStartTime',
      headerName: 'Time',
      flex: 0.8,
      minWidth: 85,
      sortable: false,
      editable: false,
      renderCell: (params: GridRenderCellParams) => {
        const isStart = params.row.isTimeGroupStart;
        const isEnd = params.row.isTimeGroupEnd;

        return (
          <div
            className={`flex w-full h-full items-center justify-center font-mono text-xs font-bold text-blue-700 ${
              !isEnd ? 'border-b-0' : ''
            }`}
          >
            {isStart ? params.value : ''}
          </div>
        );
      },
    },
    { field: 'title', headerName: 'Title', flex: 1.5, minWidth: 150, sortable: false, editable: true },
    {
      field: 'duration',
      headerName: 'Duration',
      type: 'number',
      flex: 1.2,
      minWidth: 95,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      editable: true,
      renderCell: (params: GridRenderCellParams) => {
        const val = Number(params.value);
        if (!val || val <= 0) return '';
        return (
          <span className="font-semibold text-slate-700">
            {val} {val === 1 ? 'min' : 'mins'}
          </span>
        );
      },
    },
    { field: 'detail', headerName: 'Detail', flex: 1.2, minWidth: 140, sortable: false, editable: true },
    { field: 'anchorPreacher', headerName: 'Anchor / Preacher', flex: 1.0, minWidth: 130, sortable: false, editable: true },
    { field: 'mainInstrument', headerName: 'Main Instrument', flex: 2.0, minWidth: 180, sortable: false, editable: true },
    { field: 'ledLiveScreens', headerName: 'LED / Live Screens', flex: 1.0, minWidth: 130, sortable: false, editable: true },
    { field: 'overlayBroadcast', headerName: 'Overlay / Broadcast', flex: 1.0, minWidth: 130, sortable: false, editable: true },
    { field: 'lighting', headerName: 'Lighting', flex: 0.8, minWidth: 95, sortable: false, editable: true },
    { field: 'audio', headerName: 'Audio', flex: 0.7, minWidth: 85, sortable: false, editable: true },
    {
      field: 'actions',
      headerName: '',
      width: 45,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <button
          onClick={() => handleDeleteRow(params.id)}
          className="rounded p-1.5 text-red-600 hover:bg-red-50 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          title="Delete Segment"
        >
          <HiTrash className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm w-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{channelName}</h2>
          <p className="text-xs text-slate-500 font-medium">
            Channel ID: {channelId} • Live Operations Runsheet
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
              className="w-20 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setIsDirty(true);
              }}
              placeholder="09:30 AM"
            />
          </div>

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

      {/* Alert status */}
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

      {/* Whole Table Display With Visually Merged Shared-Time Cells & Centered Duration */}
      <div className="w-full overflow-x-auto">
        <div style={{ minWidth: '950px', width: '100%' }}>
          <DataGrid
            rows={calculatedRows}
            columns={columns}
            processRowUpdate={handleProcessRowUpdate}
            onProcessRowUpdateError={(err) => console.error(err)}
            density="compact"
            hideFooter
            hideFooterPagination
            showColumnVerticalBorder
            showCellVerticalBorder
            disableColumnSorting
            disableColumnMenu
            disableRowSelectionOnClick
            sx={{
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f1f5f9',
                color: '#0f172a',
                fontWeight: 700,
                borderBottom: '2px solid #cbd5e1',
              },
              '& .MuiDataGrid-columnHeader': {
                borderRight: '1px solid #cbd5e1',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 700,
                color: '#0f172a',
              },
              '& .MuiDataGrid-cell': {
                color: '#0f172a',
                borderRight: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0',
              },
              '& .MuiDataGrid-cell[data-field="calculatedStartTime"]': {
                backgroundColor: '#f8fafc',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: '#f8fafc',
              },
              '& .MuiDataGrid-cell:focus-within': {
                outline: '2px solid #be185d',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
