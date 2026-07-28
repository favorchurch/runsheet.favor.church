'use client';

import React, { useEffect, useState } from 'react';
import { CreateRunsheetForm } from '@/components/CreateRunsheetForm';
import { RunsheetTableEditor } from '@/components/RunsheetTableEditor';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetRunsheetDetails, RunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';

export function RunsheetManager() {
  const [createdChannels, setCreatedChannels] = useState<{ id: number; name: string }[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [runsheetData, setRunsheetData] = useState<RunsheetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    async function loadChannels() {
      try {
        await getRockContentChannelOptions();
      } catch (err) {
        console.error(err);
      }
    }
    loadChannels();
  }, []);

  const handleSelectChannel = async (id: number) => {
    setSelectedChannelId(id);
    setLoading(true);
    const res = await rockGetRunsheetDetails(id);
    if (res.success && res.data) {
      setRunsheetData(res.data);
    } else {
      alert(res.error || 'Could not load runsheet');
    }
    setLoading(false);
  };

  const handleRunsheetCreated = (newChannelId: number, title: string) => {
    setCreatedChannels((prev) => [{ id: newChannelId, name: title }, ...prev]);
    setShowCreateForm(false);
    handleSelectChannel(newChannelId);
  };

  return (
    <div className="w-full max-w-none space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <label className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
            Select Runsheet:
          </label>
          <select
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
            value={selectedChannelId || ''}
            onChange={(e) => e.target.value && handleSelectChannel(Number(e.target.value))}
          >
            <option value="">Select a Runsheet Channel...</option>
            {createdChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (ID: {c.id}) [NEW]
              </option>
            ))}
            <option value="20">Sunday Service Runsheet // August 3, 2026 // AM (ID: 20)</option>
            <option value="19">Sunday Service Runsheet // August 2, 2026 // AM (ID: 19)</option>
            <option value="17">SUNDAY // 7/12 // PM (ID: 17)</option>
            <option value="16">SUNDAY 7/12/2026 (ID: 16)</option>
            <option value="15">SUNDAY 7/5/2026 (ID: 15)</option>
            <option value="9">SUNDAY 6/28/2026 (ID: 9)</option>
          </select>
        </div>

        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="w-full sm:w-auto rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer min-h-[38px]"
        >
          {showCreateForm ? 'Close Channel Creator' : '+ Create New Runsheet Channel'}
        </button>
      </div>

      {showCreateForm && (
        <div className="mx-auto max-w-lg">
          <CreateRunsheetForm onCreated={handleRunsheetCreated} />
        </div>
      )}

      {/* Runsheet HTML Table Editor with Native rowSpan */}
      {loading ? (
        <div className="py-12 text-center text-sm font-medium text-slate-600">Loading Runsheet from Rock...</div>
      ) : runsheetData ? (
        <RunsheetTableEditor
          channelId={runsheetData.channelId}
          channelName={runsheetData.name}
          columns={runsheetData.columns}
          initialItems={runsheetData.items}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center text-sm font-medium text-slate-500">
          Select a Runsheet above or create a new one to start editing.
        </div>
      )}
    </div>
  );
}
