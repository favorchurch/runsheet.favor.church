/* eslint-disable @next/next/no-html-link-for-pages */
'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { canUserEditRunsheet } from '@/lib/permissions';
import { parseStartTimeFromRunsheetName } from '@/lib/runsheetTime';
import { rockGetAvailableRunsheetChannels, type RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { AuthUser } from '@/types/AuthUser';
import type { RunsheetDetails } from '@/types/Runsheet';
import { CreateRunsheetForm } from './CreateRunsheetForm';
import { RunsheetTableEditor } from './RunsheetTableEditor';

interface RunsheetManagerProps {
  user?: AuthUser;
  initialChannelId?: number | null;
  initialShowCreate?: boolean;
}

type PendingNavigationAction =
  | { type: 'selectChannel'; id: number }
  | { type: 'toggleCreateForm' }
  | { type: 'selectEmptyChannel' }
  | { type: 'browserBack' }
  | null;

export function RunsheetManager({
  user,
  initialChannelId = null,
  initialShowCreate = false,
}: RunsheetManagerProps) {
  const [availableChannels, setAvailableChannels] = useState<RunsheetChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(initialChannelId);
  const [runsheetData, setRunsheetData] = useState<RunsheetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(initialShowCreate);

  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingNavigationAction>(null);
  const [showArchived, setShowArchived] = useState(false);

  const saveRunsheetRef = React.useRef<(() => Promise<boolean>) | null>(null);

  const canEdit = canUserEditRunsheet(user);

  const updateUrl = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
    }
  };

  // Lock browser back button (< button) when edits are unsaved
  useEffect(() => {
    const handlePopState = () => {
      if (isEditorDirty) {
        window.history.pushState(null, '', window.location.href);
        setPendingAction({ type: 'browserBack' });
        setShowUnsavedModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isEditorDirty]);

  const loadChannelDetails = React.useCallback(async (id: number) => {
    setSelectedChannelId(id);
    setLoading(true);
    updateUrl(`/${id}`);
    const res = await rockGetRunsheetDetails(id);
    if (res.success && res.data) {
      setRunsheetData(res.data);
    } else {
      alert(res.error || 'Could not load runsheet');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    async function loadChannels() {
      setChannelsLoading(true);
      const res = await rockGetAvailableRunsheetChannels(showArchived);
      if (res.success && res.channels) {
        setAvailableChannels(res.channels);

        if (initialChannelId && res.channels.some((c) => c.id === initialChannelId)) {
          loadChannelDetails(initialChannelId);
        } else if (res.channels.length > 0 && !initialChannelId && !initialShowCreate) {
          loadChannelDetails(res.channels[0].id);
        }
      }
      setChannelsLoading(false);
    }
    loadChannels();
  }, [initialChannelId, initialShowCreate, loadChannelDetails, showArchived]);

  const executeAction = (action: PendingNavigationAction) => {
    if (!action) return;
    setIsEditorDirty(false);

    if (action.type === 'selectChannel') {
      setShowCreateForm(false);
      loadChannelDetails(action.id);
    } else if (action.type === 'toggleCreateForm') {
      const nextShow = !showCreateForm;
      setShowCreateForm(nextShow);
      if (nextShow) updateUrl('/create');
    } else if (action.type === 'selectEmptyChannel') {
      setSelectedChannelId(null);
      setRunsheetData(null);
    } else if (action.type === 'browserBack') {
      window.history.go(-2);
    }
  };

  const handleSelectChannel = (id: number) => {
    if (id === selectedChannelId && !showCreateForm) return;

    const action: PendingNavigationAction = id ? { type: 'selectChannel', id } : { type: 'selectEmptyChannel' };

    if (isEditorDirty) {
      setPendingAction(action);
      setShowUnsavedModal(true);
    } else {
      executeAction(action);
    }
  };

  const handleToggleCreateForm = () => {
    const action: PendingNavigationAction = { type: 'toggleCreateForm' };
    if (isEditorDirty) {
      setPendingAction(action);
      setShowUnsavedModal(true);
    } else {
      executeAction(action);
    }
  };

  const handleRunsheetCreated = (newChannelId: number, title: string) => {
    setAvailableChannels((prev) => [{ id: newChannelId, name: title }, ...prev]);
    setShowCreateForm(false);
    setIsEditorDirty(false);
    loadChannelDetails(newChannelId);
  };

  // Deleting always lands on the empty "/" home state — it never auto-opens
  // another runsheet, so the address bar and the displayed content agree
  // instead of racing each other.
  const handleRunsheetDeleted = async (deletedId: number) => {
    setIsEditorDirty(false);
    setRunsheetData(null);
    setSelectedChannelId(null);
    updateUrl('/');

    const res = await rockGetAvailableRunsheetChannels(showArchived);
    if (res.success && res.channels) {
      setAvailableChannels(res.channels.filter((c) => c.id !== deletedId));
    }
  };

  const handleSaveAndLeave = async () => {
    if (saveRunsheetRef.current) {
      setIsSavingModal(true);
      const success = await saveRunsheetRef.current();
      setIsSavingModal(false);
      if (success) {
        setShowUnsavedModal(false);
        if (pendingAction) {
          executeAction(pendingAction);
          setPendingAction(null);
        }
      }
    } else {
      handleDiscardAndProceed();
    }
  };

  const handleDiscardAndProceed = () => {
    setShowUnsavedModal(false);
    if (pendingAction) {
      executeAction(pendingAction);
      setPendingAction(null);
    }
  };

  return (
    <div className="w-full max-w-none space-y-4">
      {/* Sticky App Header — always visible, even while editing */}
      <header className="sticky top-0 z-40 -mx-3 sm:-mx-6 mb-2 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <Image
            src="/img/favorlogo-black-on-transparent.png"
            alt="Favor Church logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
            priority
          />
          <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight">
            Favor Runsheet Studio
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {user && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-slate-100 border border-slate-200 px-2.5 py-1 font-semibold text-slate-800">
              <span className="text-slate-500">👤</span>
              {user.contact?.fullName || user.name || user.email || 'User'}
            </span>
          )}
          <a
            href="/api/auth/logout"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Log out
          </a>
        </div>
      </header>

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 w-full sm:w-auto">
          <label className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
            Select Runsheet:
          </label>
          <select
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
            value={selectedChannelId || ''}
            disabled={channelsLoading}
            onChange={(e) => handleSelectChannel(Number(e.target.value))}
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

          {canEdit && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Show Archived</span>
            </label>
          )}
        </div>

        {canEdit && (
          <button
            onClick={handleToggleCreateForm}
            className="w-full sm:w-auto rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer min-h-[38px]"
          >
            {showCreateForm ? 'Close Form' : '+ Create New Runsheet'}
          </button>
        )}
      </div>

      {canEdit && showCreateForm && (
        <div className="mx-auto max-w-lg">
          <CreateRunsheetForm onCreated={handleRunsheetCreated} onCancel={handleToggleCreateForm} />
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal with 3 Options */}
      {showUnsavedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Unsaved Changes</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have unsaved changes on the current runsheet. What would you like to do before leaving?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveAndLeave}
                disabled={isSavingModal}
                className="w-full rounded-lg bg-pink-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-pink-800 cursor-pointer disabled:opacity-50"
              >
                {isSavingModal ? 'Saving to Rock...' : '1. Save & Leave'}
              </button>

              <button
                type="button"
                onClick={handleDiscardAndProceed}
                disabled={isSavingModal}
                className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                2. Discard & Leave
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  setPendingAction(null);
                }}
                disabled={isSavingModal}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                3. Cancel & Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Runsheet HTML Table Editor */}
      {loading ? (
        <div className="py-12 text-center text-sm font-medium text-slate-600">Loading Runsheet from Rock...</div>
      ) : runsheetData ? (
        <RunsheetTableEditor
          key={runsheetData.channelId}
          channelId={runsheetData.channelId}
          channelName={runsheetData.name}
          columns={runsheetData.columns}
          initialItems={runsheetData.items}
          initialStartTime={parseStartTimeFromRunsheetName(runsheetData.name)}
          readOnly={!canEdit}
          onDeleted={() => handleRunsheetDeleted(runsheetData.channelId)}
          onDirtyChange={(dirty) => setIsEditorDirty(dirty)}
          onSaveRef={(saveFn) => (saveRunsheetRef.current = saveFn)}
        />
      ) : null}
    </div>
  );
}

