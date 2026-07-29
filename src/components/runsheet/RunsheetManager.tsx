'use client';

import React, { useEffect, useState } from 'react';
import { canUserEditRunsheet } from '@/lib/permissions';
import { rockGetAvailableRunsheetChannels, type RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { AuthUser } from '@/types/AuthUser';
import type { RunsheetDetails } from '@/types/Runsheet';
import { CreateRunsheetForm } from './CreateRunsheetForm';
import { RunsheetTableEditor } from './RunsheetTableEditor';

interface RunsheetManagerProps {
  user?: AuthUser;
}

export function RunsheetManager({ user }: RunsheetManagerProps) {
  const [availableChannels, setAvailableChannels] = useState<RunsheetChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [runsheetData, setRunsheetData] = useState<RunsheetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const canEdit = canUserEditRunsheet(user);

  useEffect(() => {
    async function loadChannels() {
      setChannelsLoading(true);
      const res = await rockGetAvailableRunsheetChannels();
      if (res.success && res.channels) {
        setAvailableChannels(res.channels);
      }
      setChannelsLoading(false);
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
    setAvailableChannels((prev) => [{ id: newChannelId, name: title }, ...prev]);
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
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
            value={selectedChannelId || ''}
            disabled={channelsLoading}
            onChange={(e) => e.target.value && handleSelectChannel(Number(e.target.value))}
          >
            <option value="">
              {channelsLoading ? 'Loading runsheets...' : 'Select a Runsheet...'}
            </option>
            {availableChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {canEdit && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full sm:w-auto rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer min-h-[38px]"
          >
            {showCreateForm ? 'Close Form' : '+ Create New Runsheet'}
          </button>
        )}
      </div>

      {canEdit && showCreateForm && (
        <div className="mx-auto max-w-lg">
          <CreateRunsheetForm onCreated={handleRunsheetCreated} />
        </div>
      )}

      {/* Runsheet HTML Table Editor */}
      {loading ? (
        <div className="py-12 text-center text-sm font-medium text-slate-600">Loading Runsheet from Rock...</div>
      ) : runsheetData ? (
        <RunsheetTableEditor
          channelId={runsheetData.channelId}
          channelName={runsheetData.name}
          columns={runsheetData.columns}
          initialItems={runsheetData.items}
          readOnly={!canEdit}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center text-sm font-medium text-slate-500">
          Select a Runsheet above or create a new one to start editing.
        </div>
      )}
    </div>
  );
}
