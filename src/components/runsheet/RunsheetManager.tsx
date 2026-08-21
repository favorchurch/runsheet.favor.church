/* eslint-disable @next/next/no-html-link-for-pages */
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from 'react-query';
import { HiArrowsRightLeft, HiEye, HiPencilSquare } from 'react-icons/hi2';
import { canUserEditRunsheet } from '@/lib/permissions';
import { parseStartTimeFromRunsheetName } from '@/lib/runsheetTime';
import { extractChannelTime, sortRunsheetChannels } from '@/lib/runsheetDate';
import type { RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';
import type { AuthUser } from '@/types/AuthUser';
import type { RunsheetDetails } from '@/types/Runsheet';
import {
  getRunsheetAccessScope,
  runsheetQueryKeys,
  useAvailableRunsheetChannels,
  useRunsheetDetails,
} from './runsheetQueries';
import { CreateRunsheetForm } from './CreateRunsheetForm';
import { RunsheetTableEditor } from './RunsheetTableEditor';
import { RunsheetCompareView } from './RunsheetCompareView';
import { RunsheetTableSkeleton } from './RunsheetTableSkeleton';
import { RunsheetLandingView } from './RunsheetLandingView';

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
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(initialChannelId);
  const [showCreateForm, setShowCreateForm] = useState(initialShowCreate);

  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingNavigationAction>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
  const [compareSelection, setCompareSelection] = useState<Set<number>>(new Set());
  const [compareViewOpen, setCompareViewOpen] = useState(false);

  /**
   * The runsheet editor's own sticky title/toolbar bar needs to stick just
   * below this header rather than at `top: 0` too, or the two sticky
   * elements fight over the same spot once you scroll. Measured live (not
   * hardcoded) since the header's height isn't fixed across breakpoints.
   */
  const appHeaderRef = useRef<HTMLElement | null>(null);
  const [appHeaderHeight, setAppHeaderHeight] = useState(0);

  useEffect(() => {
    const el = appHeaderRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // `getBoundingClientRect` (not the observer's own `contentRect`, which
    // excludes padding/border) so this matches the header's actual occupied
    // height — the exact offset the editor's sticky bar needs to sit below.
    const observer = new ResizeObserver(() => setAppHeaderHeight(Math.ceil(el.getBoundingClientRect().height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const saveRunsheetRef = React.useRef<(() => Promise<boolean>) | null>(null);
  const activeChannelIdRef = React.useRef<number | null>(initialChannelId);
  const lastInitialChannelIdRef = React.useRef<number | null>(initialChannelId);
  const localRouteTargetRef = React.useRef<number | null | undefined>(undefined);
  const restoredRouteRef = React.useRef<number | null | undefined>(undefined);
  const deletedChannelIdsRef = React.useRef<Set<number>>(new Set());

  const canEdit = canUserEditRunsheet(user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessScope = getRunsheetAccessScope(user);
  const channelsQuery = useAvailableRunsheetChannels(showArchived, accessScope);
  const detailsQuery = useRunsheetDetails(selectedChannelId, accessScope);

  const availableChannels: RunsheetChannelOption[] = sortRunsheetChannels(
    (channelsQuery.data?.channels || []).filter(
      (channel) => !deletedChannelIdsRef.current.has(channel.id),
    ),
  );
  const runsheetData: RunsheetDetails | null = detailsQuery.data?.data || null;
  const channelsLoading = channelsQuery.isLoading && !channelsQuery.data;
  const loading = selectedChannelId !== null && detailsQuery.isLoading;

  /**
   * Switching channels used to call `window.history.pushState` directly —
   * it updates the address bar, but Next's own client router never learns
   * the "current route" changed. That desync is invisible until a Server
   * Action resolves (e.g. saving): Next then tries to refresh whatever
   * route it still THINKS is active, discovers the URL bar has moved out
   * from under it, and falls back to a full reload to resync — which is
   * exactly what wiped an open propagate review right after a save, but
   * only once you'd switched sheets at least once first. Routing through
   * `router.push` keeps Next's router state and the URL bar in agreement,
   * so that fallback reload never has a reason to fire.
   */
  const updateUrl = React.useCallback((path: string) => {
    router.push(path, { scroll: false });
  }, [router]);

  // A view-only account landing directly on a page it has no access to
  // (e.g. `/create`) correctly renders nothing — but without this, the URL
  // itself just sits there instead of returning to the home screen.
  useEffect(() => {
    if (showCreateForm && !canEdit) {
      setShowCreateForm(false);
      updateUrl('/');
    }
  }, [showCreateForm, canEdit]);

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

  /**
   * Dynamic route pages can remain mounted while Next supplies a new server
   * prop. Treat that prop as an external navigation unless it is the target
   * of a navigation this manager already accepted. Dirty editors keep their
   * active channel until the existing confirmation flow accepts or discards
   * the pending route.
   */
  useEffect(() => {
    if (initialChannelId === lastInitialChannelIdRef.current) return;
    lastInitialChannelIdRef.current = initialChannelId;

    if (restoredRouteRef.current === initialChannelId) {
      restoredRouteRef.current = undefined;
      return;
    }

    if (localRouteTargetRef.current === initialChannelId) {
      localRouteTargetRef.current = undefined;
      return;
    }

    const pendingRouteAction: PendingNavigationAction = initialChannelId
      ? { type: 'selectChannel', id: initialChannelId }
      : { type: 'selectEmptyChannel' };

    if (isEditorDirty) {
      setPendingAction(pendingRouteAction);
      setShowUnsavedModal(true);
      restoredRouteRef.current = activeChannelIdRef.current;
      updateUrl(activeChannelIdRef.current === null ? '/' : `/${activeChannelIdRef.current}`);
      return;
    }

    activeChannelIdRef.current = initialChannelId;
    setSelectedChannelId(initialChannelId);
    setEditorMode('view');
    if (initialChannelId !== null) setShowCreateForm(false);
  }, [initialChannelId, isEditorDirty, updateUrl]);

  const loadChannelDetails = React.useCallback((id: number) => {
    localRouteTargetRef.current = id;
    activeChannelIdRef.current = id;
    setEditorMode('view');
    setSelectedChannelId(id);
    updateUrl(`/${id}`);
  }, [updateUrl]);

  const handleModeChange = (nextMode: 'view' | 'edit') => {
    if (nextMode === 'edit' && !canUserEditRunsheet(user)) {
      setEditorMode('view');
      return;
    }
    setEditorMode(nextMode);
  };

  const isEditMode = canEdit && editorMode === 'edit';

  useEffect(() => {
    if (!canEdit) setEditorMode('view');
  }, [canEdit]);

  useEffect(() => {
    if (channelsQuery.error) console.error('Error loading channels:', channelsQuery.error);
  }, [channelsQuery.error]);

  useEffect(() => {
    if (!detailsQuery.error || selectedChannelId === null || activeChannelIdRef.current !== selectedChannelId) return;

    alert(detailsQuery.error instanceof Error ? detailsQuery.error.message : 'Could not load runsheet');
    activeChannelIdRef.current = null;
    setSelectedChannelId(null);
    updateUrl('/');
  }, [detailsQuery.error, selectedChannelId, updateUrl]);

  const executeAction = (action: PendingNavigationAction) => {
    if (!action) return;
    setIsEditorDirty(false);

    if (action.type === 'selectChannel') {
      setShowCreateForm(false);
      loadChannelDetails(action.id);
    } else if (action.type === 'toggleCreateForm') {
      const nextShow = !showCreateForm;
      if (nextShow) {
        localRouteTargetRef.current = null;
        activeChannelIdRef.current = null;
        setSelectedChannelId(null);
        setEditorMode('view');
      }
      setShowCreateForm(nextShow);
      if (nextShow) updateUrl('/create');
    } else if (action.type === 'selectEmptyChannel') {
      localRouteTargetRef.current = null;
      activeChannelIdRef.current = null;
      setShowCreateForm(false);
      setSelectedChannelId(null);
      setEditorMode('view');
      updateUrl('/');
    } else if (action.type === 'browserBack') {
      window.history.go(-2);
    }
  };

  const handleSelectChannel = (id: number) => {
    if (!id || (id === selectedChannelId && !showCreateForm)) return;

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

  const handleGoHome = () => {
    if (!selectedChannelId && !showCreateForm && !loading) return;

    const action: PendingNavigationAction = { type: 'selectEmptyChannel' };
    if (isEditorDirty) {
      setPendingAction(action);
      setShowUnsavedModal(true);
    } else {
      executeAction(action);
    }
  };

  const handleRunsheetCreated = (newChannelId: number, title: string, createdData?: RunsheetDetails) => {
    const newChannel = { id: newChannelId, name: title, time: extractChannelTime(title) };
    queryClient.setQueryData(runsheetQueryKeys.channels(showArchived, accessScope), (current: any) => ({
      success: true,
      channels: [newChannel, ...(current?.channels || []).filter((channel: RunsheetChannelOption) => channel.id !== newChannelId)],
    }));
    queryClient.invalidateQueries(runsheetQueryKeys.channelsRoot);
    setShowCreateForm(false);
    setIsEditorDirty(false);
    setEditorMode('view');
    localRouteTargetRef.current = newChannelId;
    activeChannelIdRef.current = newChannelId;
    setSelectedChannelId(newChannelId);
    updateUrl(`/${newChannelId}`);

    if (createdData && createdData.items) {
      queryClient.setQueryData(runsheetQueryKeys.details(newChannelId, accessScope), { success: true, data: createdData });
      queryClient.invalidateQueries(runsheetQueryKeys.details(newChannelId, accessScope));
    } else {
      loadChannelDetails(newChannelId);
    }
  };

  // Deleting always lands on the empty "/" home state — it never auto-opens
  // another runsheet, so the address bar and the displayed content agree
  // instead of racing each other.
  const handleRunsheetDeleted = async (deletedId: number) => {
    localRouteTargetRef.current = null;
    deletedChannelIdsRef.current.add(deletedId);
    activeChannelIdRef.current = null;
    setIsEditorDirty(false);
    setSelectedChannelId(null);
    updateUrl('/');

    queryClient.setQueryData(runsheetQueryKeys.channels(showArchived, accessScope), (current: any) => ({
      success: true,
      channels: (current?.channels || []).filter((channel: RunsheetChannelOption) => channel.id !== deletedId),
    }));
    queryClient.invalidateQueries(runsheetQueryKeys.channelsRoot);
    queryClient.invalidateQueries(runsheetQueryKeys.details(deletedId, accessScope));
  };

  const handleOptimisticSave = React.useCallback((updatedData: RunsheetDetails) => {
    queryClient.setQueryData(runsheetQueryKeys.details(updatedData.channelId, accessScope), { success: true, data: updatedData });
    queryClient.invalidateQueries(runsheetQueryKeys.details(updatedData.channelId, accessScope));
  }, [accessScope, queryClient]);

  const handleSaveSettled = React.useCallback((channelId: number) => {
    queryClient.invalidateQueries(runsheetQueryKeys.details(channelId, accessScope));
  }, [accessScope, queryClient]);

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
      <header
        ref={appHeaderRef}
        className="sticky top-0 z-40 -mx-3 sm:-mx-6 mb-2 bg-white/95 backdrop-blur border-b border-slate-200/80 px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between shadow-xs"
      >
        <button
          type="button"
          onClick={handleGoHome}
          className="flex items-center gap-2 cursor-pointer rounded-lg hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Back to home"
        >
          <Image
            src="/img/favorlogo-black-on-transparent.png"
            alt="Favor Church logo"
            width={30}
            height={30}
            className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
            priority
          />
          <span className="text-xs sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight">
            Favor Runsheet Platform
          </span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs">
          {user && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-slate-100 border border-slate-200 px-2.5 py-1 font-semibold text-slate-800">
              <span className="text-slate-500">👤</span>
              {user.contact?.fullName || user.name || user.email || 'User'}
            </span>
          )}
          <a
            href="/api/auth/logout"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 sm:px-3 py-1 sm:py-1.5 font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Log out
          </a>
        </div>
      </header>

      {/* Landing Page View when no runsheet is selected and not in create form */}
      {!selectedChannelId && !showCreateForm ? (
        <RunsheetLandingView
          channels={availableChannels}
          isLoading={channelsLoading}
          canEdit={canEdit}
          showArchived={showArchived}
          onToggleShowArchived={(show) => setShowArchived(show)}
          onSelectChannel={handleSelectChannel}
          onCreateNew={canEdit ? handleToggleCreateForm : undefined}
          accessScope={accessScope}
        />
      ) : (
        <>
          {/* Top Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto min-w-0">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
                Select Runsheet:
              </label>
              <div className="flex items-center gap-2">
                <select
                  className="w-full sm:w-auto min-w-0 max-w-full md:max-w-md text-ellipsis rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
                  value={selectedChannelId || ''}
                  disabled={channelsLoading}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val) handleSelectChannel(val);
                  }}
                >
                  {(!selectedChannelId || channelsLoading) && (
                    <option value="" disabled hidden>
                      {channelsLoading ? 'Loading runsheets...' : 'Select a Runsheet...'}
                    </option>
                  )}
                  {availableChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {canEdit && (
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Show Archived</span>
                </label>
              )}

              {canEdit && availableChannels.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (compareSelection.size === 0 && selectedChannelId) {
                      const other = availableChannels.find((c) => c.id !== selectedChannelId);
                      if (other) {
                        setCompareSelection(new Set([selectedChannelId, other.id]));
                      } else {
                        setCompareSelection(new Set(availableChannels.slice(0, 2).map((c) => c.id)));
                      }
                    } else if (compareSelection.size === 0 && availableChannels.length >= 2) {
                      setCompareSelection(new Set(availableChannels.slice(0, 2).map((c) => c.id)));
                    }
                    setCompareViewOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer shadow-xs"
                  title="Compare runsheets side-by-side"
                >
                  <HiArrowsRightLeft className="h-3.5 w-3.5 text-slate-600" />
                  <span>Compare</span>
                </button>
              )}

              {canEdit && (
                <div role="group" aria-label="Runsheet mode" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    aria-label="View mode"
                    title="View mode"
                    aria-pressed={editorMode === 'view'}
                    onClick={() => handleModeChange('view')}
                    className={`flex items-center justify-center rounded-md p-1.5 transition-all cursor-pointer ${editorMode === 'view'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <HiEye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Edit mode"
                    title="Edit mode"
                    aria-pressed={editorMode === 'edit'}
                    onClick={() => handleModeChange('edit')}
                    className={`flex items-center justify-center rounded-md p-1.5 transition-all cursor-pointer ${editorMode === 'edit'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <HiPencilSquare className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {canEdit && (
              <button
                onClick={handleToggleCreateForm}
                className="w-full md:w-auto shrink-0 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer min-h-[34px]"
              >
                {showCreateForm ? 'Close Form' : '+ Create New Runsheet'}
              </button>
            )}
          </div>

          {canEdit && showCreateForm && (
            <div className="mx-auto max-w-lg">
              <CreateRunsheetForm
                runsheetCampuses={user?.access?.runsheetCampuses}
                onCreated={handleRunsheetCreated}
                onCancel={handleToggleCreateForm}
              />
            </div>
          )}

          {((detailsQuery.isFetching && selectedChannelId !== null) || (channelsQuery.isFetching && !channelsLoading)) && (
            <span
              role="status"
              aria-label="Fetching runsheet"
              aria-live="polite"
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"
            >
              <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              Updating runsheet data…
            </span>
          )}

          {/* Runsheet HTML Table Editor */}
          {loading ? (
            <RunsheetTableSkeleton />
          ) : runsheetData && !showCreateForm ? (
            <RunsheetTableEditor
              key={runsheetData.channelId}
              channelId={runsheetData.channelId}
              channelName={runsheetData.name}
              columns={runsheetData.columns}
              initialItems={runsheetData.items}
              initialStartTime={
                runsheetData.startTime ||
                (runsheetData.subtitle && /^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(runsheetData.subtitle.trim())
                  ? runsheetData.subtitle.trim()
                  : parseStartTimeFromRunsheetName(runsheetData.name))
              }
              initialSubtitle={runsheetData.subtitle}
              stickyTopOffset={appHeaderHeight}
              readOnly={!isEditMode}
              runsheetCampuses={user?.access?.runsheetCampuses}
              onCreated={handleRunsheetCreated}
              onDeleted={() => handleRunsheetDeleted(runsheetData.channelId)}
              onDirtyChange={(dirty) => setIsEditorDirty(dirty)}
              onSaveRef={(saveFn) => (saveRunsheetRef.current = saveFn)}
              onOptimisticSave={handleOptimisticSave}
              onSaveSettled={handleSaveSettled}
            />
          ) : null}
        </>
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

      {compareViewOpen && (
        <RunsheetCompareView
          channelIds={Array.from(compareSelection)}
          availableChannels={availableChannels}
          onSelectionChange={(next) => setCompareSelection(new Set(next))}
          readOnly={!isEditMode}
          onSaveSettled={handleSaveSettled}
          onClose={() => setCompareViewOpen(false)}
        />
      )}
    </div>
  );
}
