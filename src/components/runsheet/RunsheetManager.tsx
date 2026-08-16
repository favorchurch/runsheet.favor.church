/* eslint-disable @next/next/no-html-link-for-pages */
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { canUserEditRunsheet } from '@/lib/permissions';
import { parseStartTimeFromRunsheetName } from '@/lib/runsheetTime';
import { extractChannelTime } from '@/lib/runsheetDate';
import { rockGetAvailableRunsheetChannels, type RunsheetChannelOption } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import type { AuthUser } from '@/types/AuthUser';
import type { RunsheetDetails } from '@/types/Runsheet';
import { CreateRunsheetForm } from './CreateRunsheetForm';
import { RunsheetTableEditor } from './RunsheetTableEditor';
import { RunsheetCompareView } from './RunsheetCompareView';

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
  const [loading, setLoading] = useState(initialChannelId !== null);
  const [showCreateForm, setShowCreateForm] = useState(initialShowCreate);

  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingNavigationAction>(null);
  const [showArchived, setShowArchived] = useState(false);
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
  const deletedChannelIdsRef = React.useRef<Set<number>>(new Set());

  const canEdit = canUserEditRunsheet(user);
  const router = useRouter();

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
  const updateUrl = (path: string) => {
    router.push(path, { scroll: false });
  };

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

  const loadChannelDetails = React.useCallback(async (id: number) => {
    activeChannelIdRef.current = id;
    setSelectedChannelId(id);
    setLoading(true);
    updateUrl(`/${id}`);
    try {
      let res = await rockGetRunsheetDetails(id);

      // Retry once after 400ms if initial read fails (e.g. right after channel creation or cold start)
      if (!res.success && activeChannelIdRef.current === id) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (activeChannelIdRef.current === id) {
          res = await rockGetRunsheetDetails(id);
        }
      }

      if (activeChannelIdRef.current !== id) return;

      if (res.success && res.data) {
        setRunsheetData(res.data);
      } else {
        alert(res.error || 'Could not load runsheet');
        activeChannelIdRef.current = null;
        setSelectedChannelId(null);
        setRunsheetData(null);
        updateUrl('/');
      }
    } catch (err: any) {
      if (activeChannelIdRef.current !== id) return;
      alert(err?.message || 'Could not load runsheet');
      activeChannelIdRef.current = null;
      setSelectedChannelId(null);
      setRunsheetData(null);
      updateUrl('/');
    } finally {
      if (activeChannelIdRef.current === id) {
        setLoading(false);
      }
    }
  }, []);

  // On initial mount with a channelId in URL (e.g. /45 on refresh), load the channel details immediately
  useEffect(() => {
    if (initialChannelId) {
      loadChannelDetails(initialChannelId);
    }
  }, [initialChannelId, loadChannelDetails]);

  useEffect(() => {
    let isCancelled = false;
    async function loadChannels() {
      setChannelsLoading(true);
      try {
        const res = await rockGetAvailableRunsheetChannels(showArchived);
        if (isCancelled) return;

        if (res.success && res.channels) {
          const filtered = res.channels.filter((c) => !deletedChannelIdsRef.current.has(c.id));
          setAvailableChannels(filtered);
        }
        // A channel missing from this list (deleted, no campus access, or a
        // transient race right after a write) is NOT treated as fatal here —
        // this effect only populates the picker dropdown. Whether the
        // currently open channel is actually valid is loadChannelDetails's
        // job alone; duplicating that check against this separately-fetched
        // list previously wiped the whole session (including an open
        // propagate review) whenever the two fetches raced.
      } catch (err) {
        console.error('Error loading channels:', err);
      } finally {
        if (!isCancelled) {
          setChannelsLoading(false);
        }
      }
    }
    loadChannels();
    return () => {
      isCancelled = true;
    };
  }, [initialChannelId, showArchived]);

  const executeAction = (action: PendingNavigationAction) => {
    if (!action) return;
    setIsEditorDirty(false);

    if (action.type === 'selectChannel') {
      setShowCreateForm(false);
      loadChannelDetails(action.id);
    } else if (action.type === 'toggleCreateForm') {
      const nextShow = !showCreateForm;
      if (nextShow) {
        activeChannelIdRef.current = null;
        setSelectedChannelId(null);
        setRunsheetData(null);
        setLoading(false);
      }
      setShowCreateForm(nextShow);
      if (nextShow) updateUrl('/create');
    } else if (action.type === 'selectEmptyChannel') {
      activeChannelIdRef.current = null;
      setShowCreateForm(false);
      setSelectedChannelId(null);
      setRunsheetData(null);
      setLoading(false);
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
    setAvailableChannels((prev) => [{ id: newChannelId, name: title, time: extractChannelTime(title) }, ...prev]);
    setShowCreateForm(false);
    setIsEditorDirty(false);
    activeChannelIdRef.current = newChannelId;
    setSelectedChannelId(newChannelId);
    updateUrl(`/${newChannelId}`);

    if (createdData && createdData.items) {
      setRunsheetData(createdData);
      setLoading(false);
    } else {
      loadChannelDetails(newChannelId);
    }
  };

  // Deleting always lands on the empty "/" home state — it never auto-opens
  // another runsheet, so the address bar and the displayed content agree
  // instead of racing each other.
  const handleRunsheetDeleted = async (deletedId: number) => {
    deletedChannelIdsRef.current.add(deletedId);
    activeChannelIdRef.current = null;
    setIsEditorDirty(false);
    setRunsheetData(null);
    setSelectedChannelId(null);
    setLoading(false);
    updateUrl('/');

    setAvailableChannels((previous) => previous.filter((c) => c.id !== deletedId));

    try {
      const res = await rockGetAvailableRunsheetChannels(showArchived);
      if (res.success && res.channels) {
        setAvailableChannels(res.channels.filter((c) => !deletedChannelIdsRef.current.has(c.id)));
      }
    } catch (err) {
      console.warn('Error loading channels after delete:', err);
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
      <header
        ref={appHeaderRef}
        className="sticky top-0 z-40 -mx-3 sm:-mx-6 mb-2 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs"
      >
        <button
          type="button"
          onClick={handleGoHome}
          className="flex items-center gap-2.5 cursor-pointer rounded-lg hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Back to home"
        >
          <Image
            src="/img/favorlogo-black-on-transparent.png"
            alt="Favor Church logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
            priority
          />
          <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight">
            Favor Runsheet Platform
          </span>
        </button>

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 w-full md:w-auto min-w-0">
          <label className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
            Select Runsheet:
          </label>
          <div className="flex flex-col gap-1">
            <select
              className="w-full sm:w-auto min-w-0 max-w-full md:max-w-md text-ellipsis rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
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
            {canEdit && availableChannels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Compare selection:</span>
                {availableChannels.map((c) => (
                  <label key={c.id} className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      aria-label="Select for compare"
                      checked={compareSelection.has(c.id)}
                      onChange={() => {
                        setCompareSelection((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else if (next.size < 4) next.add(c.id);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{c.name.split('//').pop()?.trim() || c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

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

          {canEdit && (
            <button
              type="button"
              disabled={compareSelection.size < 2}
              onClick={() => setCompareViewOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              Compare ({compareSelection.size})
            </button>
          )}
        </div>

        {canEdit && (
          <button
            onClick={handleToggleCreateForm}
            className="w-full md:w-auto shrink-0 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer min-h-[38px]"
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
      ) : !runsheetData && !showCreateForm && canEdit ? (
        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Getting Started</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Pick an existing runsheet from the <span className="font-semibold">Select Runsheet</span> dropdown above, or click <span className="font-semibold">+ Create New Runsheet</span>.</li>
            <li>Click any cell to edit it — use the toolbar above the grid for formatting.</li>
            <li>Click the music icon on a segment to mark it as a song and link it to Rock.</li>
            <li>Click <span className="font-semibold">Save Runsheet</span> when you&apos;re done — nothing is saved until you do.</li>
          </ol>
        </div>
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
          readOnly={!canEdit}
          runsheetCampuses={user?.access?.runsheetCampuses}
          onCreated={handleRunsheetCreated}
          onDeleted={() => handleRunsheetDeleted(runsheetData.channelId)}
          onDirtyChange={(dirty) => setIsEditorDirty(dirty)}
          onSaveRef={(saveFn) => (saveRunsheetRef.current = saveFn)}
        />
      ) : null}

      {compareViewOpen && (
        <RunsheetCompareView
          channelIds={Array.from(compareSelection)}
          onClose={() => setCompareViewOpen(false)}
        />
      )}
    </div>
  );
}

