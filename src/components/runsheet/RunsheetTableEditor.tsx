'use client';

import type { Editor } from '@tiptap/react';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiArrowPath, HiArrowUturnLeft, HiArrowUturnRight, HiBars3, HiCheck, HiChevronDown, HiChevronUp, HiDocumentDuplicate, HiExclamationCircle, HiLockClosed, HiMusicalNote, HiPlus, HiRectangleStack, HiTableCells, HiTrash } from 'react-icons/hi2';

import { htmlToPlainText } from '@/lib/richText';

interface RunsheetSnapshot {
  items: RunsheetItemRow[];
  startTime: string;
  musicCellMap: Record<string, boolean>;
  deletedIds: (number | string)[];
}
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
import { ALL_CAMPUSES, extractRunsheetCampus, RunsheetCampusCode } from '@/lib/runsheetCampus';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockDeleteServiceRunsheet } from '@/server-actions/rockDeleteServiceRunsheet';
import { getRockContentChannelOptions, ContentChannelCategoryOption } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions, ScheduleOption } from '@/server-actions/rockGetScheduleOptions';
import { rockDuplicateServiceRunsheet } from '@/server-actions/rockDuplicateServiceRunsheet';
import type { DynamicAttributeColumn, RunsheetItemRow, RunsheetDetails } from '@/types/Runsheet';
import { resolveSiblings, type SiblingChannel } from '@/lib/runsheetSiblings';
import { matchRows, type MatchResult } from '@/lib/runsheetMatch';
import { buildPropagationPlan, type PropagationPlan, type CandidateCellChange } from '@/lib/runsheetPropagate';
import { executePropagationPlan, type PropagationOutcome } from '@/lib/runsheetPropagateExecute';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';
import { PropagateReviewPanel } from './PropagateReviewPanel';
import { PeopleSearchDropdown, parsePeopleString } from './PeopleSearchDropdown';

function extractChannelDateLabel(name: string): string {
  const parts = name.split('//');
  return parts.length >= 2 ? parts[1].trim() : '';
}
import { generateRunsheetTitle } from './CreateRunsheetForm';
import { CELL_ATTRIBUTE, RichTextCell } from './RichTextCell';
import { RichTextContent } from './RichTextContent';
import { RichTextToolbar } from './RichTextToolbar';
import { SongSearchDropdown } from './SongSearchDropdown';
import { SongDetailModal } from './SongDetailModal';
import { EventTeamRosterCard, ensureRosterItems } from './EventTeamRosterCard';

function extractCategoryCampus(catName: string): RunsheetCampusCode | null {
  if (!catName) return null;
  const upper = catName.toUpperCase();
  if (upper.includes('MNL') || upper.includes('MANILA')) return 'MNL';
  if (upper.includes('BNE') || upper.includes('BRISBANE')) return 'BNE';
  if (upper.includes('SEL') || upper.includes('SEOUL')) return 'SEL';
  return null;
}

function getNextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().split('T')[0];
}

function extractDateFromChannelName(name: string): string {
  const m1 = name.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m1) {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    const dt = new Date(year, month, day);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return getNextSunday();
}

interface RunsheetTableEditorProps {
  channelId: number;
  channelName: string;
  columns?: DynamicAttributeColumn[];
  initialItems: RunsheetItemRow[];
  initialStartTime?: string;
  initialSubtitle?: string;
  /** Pixel height of an outer page header this editor's own sticky bar must sit below, so the two don't stack on top of each other at `top: 0`. */
  stickyTopOffset?: number;
  readOnly?: boolean;
  runsheetCampuses?: string[];
  onCreated?: (channelId: number, title: string, createdData?: RunsheetDetails) => void;
  onDeleted?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveRef?: (saveFn: () => Promise<boolean>) => void;
  onOptimisticSave?: (updatedData: RunsheetDetails) => void;
  /** Invalidate the authoritative detail query after any attempted write. */
  onSaveSettled?: (channelId: number) => void;
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

/** Builds fresh template rows with unique ids, so every call (reset, auto-load) gets its own set. */
function buildTemplateState() {
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

  const templateMusicMap: Record<string, boolean> = {};
  [6, 7, 10, 11, 12].forEach((idx) => {
    templateMusicMap[String(templateRows[idx].id)] = true;
    // Flagged as music with no song linked yet — matches the toggle button's
    // convention, so the status survives the first save.
    templateRows[idx].songItemId = 0;
  });

  return { templateRows, templateMusicMap };
}

export function RunsheetTableEditor({
  channelId,
  channelName,
  columns = FALLBACK_RUNSHEET_COLUMNS,
  initialItems,
  initialStartTime = '08:00:00 AM',
  initialSubtitle = '',
  stickyTopOffset = 0,
  readOnly = false,
  runsheetCampuses,
  onCreated,
  onDeleted,
  onDirtyChange,
  onSaveRef,
  onOptimisticSave,
  onSaveSettled,
}: RunsheetTableEditorProps) {
  /**
   * A brand-new (or emptied-out) runsheet has nothing to lose, so it starts
   * pre-filled with the template instead of an empty grid — no manual "Reset
   * Form" click needed. Computed once, synchronously, during the first
   * render (not a post-mount effect): a `useEffect` here would paint an
   * empty grid first and only fill it in a tick later, which both flashes
   * and can silently wipe out anything the user managed to type into that
   * empty grid in the meantime.
   */
  const initialTemplateRef = React.useRef<ReturnType<typeof buildTemplateState> | null | undefined>(undefined);
  if (initialTemplateRef.current === undefined) {
    initialTemplateRef.current = !readOnly && initialItems.length === 0 ? buildTemplateState() : null;
  }
  const initialTemplate = initialTemplateRef.current;

  const [items, setItems] = useState<RunsheetItemRow[]>(() =>
    ensureRosterItems(initialTemplate ? initialTemplate.templateRows : initialItems)
  );
  const [deletedIds, setDeletedIds] = useState<(number | string)[]>([]);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  /** The cell currently open for editing, tracked by item ID to avoid index mismatch with roster items. */
  const [editingCell, setEditingCell] = useState<{ itemId: number | string; key: string } | null>(null);

  /**
   * Editor behind the open cell, lifted so the one formatting bar above the
   * grid can drive it — the columns are far too narrow for per-cell toolbars.
   */
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  /** Duration edits happen per merged block, so drafts are keyed by row index. */
  const [editingDurationBlockIndex, setEditingDurationBlockIndex] = useState<number | null>(null);
  /** Keyed by row id (not array index) — see handleCommitDurationDrafts for why. */
  const [durationDrafts, setDurationDrafts] = useState<{ [id: string]: string }>({});

  const [isDirty, setIsDirty] = useState(() => !!initialTemplate);
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'grid'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'grid';
    // Touch devices (phones, iPads, tablets) get Cards; laptops/desktops with mouse get Table
    return window.matchMedia('(pointer: coarse)').matches ? 'cards' : 'grid';
  });
  /** Displayed/persisted subtitle falls back to this when Rock has none set; the baseline for dirty-checking must use the same fallback or an untouched runsheet reads as dirty. */
  const normalizedInitialSubtitle = initialSubtitle || 'Sunday Service';
  const [subtitle, setSubtitle] = useState<string>(normalizedInitialSubtitle);

  useEffect(() => {
    setSubtitle(normalizedInitialSubtitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubtitle]);

  /** Baseline fingerprint representing item state as persisted in Rock. */
  interface RowFingerprint {
    title: string;
    order: number;
    startDateTime?: string;
    duration: number;
    songItemId?: number | null;
    attributeValues: Record<string, string>;
  }

  const createRowFingerprint = React.useCallback((item: RunsheetItemRow): RowFingerprint => {
    const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
    const cleanAttrValues: Record<string, string> = {};
    if (item.attributeValues) {
      Object.entries(item.attributeValues).forEach(([k, v]) => {
        cleanAttrValues[k] = v ?? '';
      });
    }

    return {
      title: richTitle,
      order: item.order,
      startDateTime: item.startDateTime,
      duration: item.duration || 0,
      songItemId: item.songItemId ?? null,
      attributeValues: cleanAttrValues,
    };
  }, []);

  const baselineRef = React.useRef<Map<number | string, RowFingerprint>>(new Map());
  /**
   * Bumped whenever `baselineRef.current` is replaced or mutated, since a ref
   * write alone doesn't trigger a re-render. Without this, `computedDirtyState`
   * memoizes its very first computation (baseline still empty, before the
   * populate effect below has run) and every item looks unsaved forever.
   */
  const [baselineVersion, setBaselineVersion] = useState(0);

  const [propagateSiblings, setPropagateSiblings] = useState<SiblingChannel[]>([]);
  const [propagateCandidates, setPropagateCandidates] = useState<CandidateCellChange[]>([]);
  const [propagateBarDismissed, setPropagateBarDismissed] = useState(false);
  const [propagatePlan, setPropagatePlan] = useState<PropagationPlan | null>(null);
  const [propagateReviewOpen, setPropagateReviewOpen] = useState(false);
  const [propagateApplying, setPropagateApplying] = useState(false);
  const [propagateOutcomes, setPropagateOutcomes] = useState<PropagationOutcome[] | undefined>(undefined);
  const [propagateTargetRows, setPropagateTargetRows] = useState<Map<number, RunsheetItemRow[]>>(new Map());
  /** itemId -> pre-edit title, for rows renamed in the save that triggered propagation (see handleSave). */
  const propagateOldTitlesRef = React.useRef<Map<number, string>>(new Map());

  // Populate initial baseline for loaded items that exist in Rock
  useEffect(() => {
    const map = new Map<number | string, RowFingerprint>();
    const fullInitialItems = ensureRosterItems(initialItems);
    fullInitialItems.forEach((item) => {
      if (typeof item.id === 'number' || (!item.isNew && item.id)) {
        map.set(item.id, createRowFingerprint(item));
      } else if (item.isNew && item.title?.startsWith('Roster:')) {
        // Auto-ensured roster items are part of default structure, store baseline fingerprint
        map.set(item.id, createRowFingerprint(item));
      }
    });
    baselineRef.current = map;
    setBaselineVersion((v) => v + 1);
  }, [initialItems, createRowFingerprint]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  /** Draft text for the Card view's Duration field — lets seconds be typed (`00:05:30`) without every keystroke reformatting the input. */
  const [cardDurationDraft, setCardDurationDraft] = useState('');
  /**
   * Draft text for the Card view's Activity Title field. Committing on every
   * keystroke (via `handleAttrValueChange`, which replaces the whole `items`
   * array and pushes an undo snapshot) is heavy enough per-keystroke work that
   * real mobile browsers can drop a character — the space bar interacting
   * with iOS/Android autocorrect being the most commonly hit case — even
   * though it can't be reproduced with synthetic test events. A local draft,
   * committed on blur, keeps typing itself cheap.
   */
  const [cardTitleDraft, setCardTitleDraft] = useState('');
  /** Same draft-until-blur treatment as the title, keyed by attribute column, for every other free-text field in the Card view (Description, etc). */
  const [cardAttrDrafts, setCardAttrDrafts] = useState<{ [key: string]: string }>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<RunsheetItemRow | null>(null);

  const handleInsertRow = (targetIndex: number, position: 'above' | 'below') => {
    if (readOnly) return;
    // targetIndex is a position within the roster-filtered `processedRows`, which
    // is not necessarily the same slot in the raw `items` array — resolve by the
    // target row's stable id so this stays correct regardless of where roster
    // placeholder rows currently sit.
    const targetId = processedRows[targetIndex]?.id;
    if (targetId === undefined) return;

    saveSnapshot();
    const newRow: RunsheetItemRow = {
      id: `new_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      isNew: true,
      title: 'New Segment',
      order: targetIndex + 1,
      duration: 5,
      attributeValues: { ACTIVITYTITLE: 'New Segment' },
      detail: '',
    };

    setItems((previous) => {
      const realTargetIndex = previous.findIndex((item) => item.id === targetId);
      if (realTargetIndex === -1) return previous;
      const insertIndex = position === 'above' ? realTargetIndex : realTargetIndex + 1;
      const updated = [...previous];
      updated.splice(insertIndex, 0, newRow);
      return updated;
    });
    setIsDirty(true);
    setEditingCell({ itemId: newRow.id, key: 'title' });
  };

  // Duplicate Runsheet Modal State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCategories, setDuplicateCategories] = useState<ContentChannelCategoryOption[]>([]);
  const [duplicateSchedules, setDuplicateSchedules] = useState<ScheduleOption[]>([]);
  const [duplicateCategoryId, setDuplicateCategoryId] = useState<number | ''>('');
  const [duplicateDate, setDuplicateDate] = useState(() => extractDateFromChannelName(channelName));
  const [duplicateSession, setDuplicateSession] = useState('');
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [loadingDuplicateOptions, setLoadingDuplicateOptions] = useState(false);
  const [loadingDuplicateSchedules, setLoadingDuplicateSchedules] = useState(false);

  const isGlobalStaffOrAdmin = React.useMemo(
    () => !runsheetCampuses || runsheetCampuses.includes(ALL_CAMPUSES),
    [runsheetCampuses]
  );
  const userAllowedCampuses = React.useMemo(
    () => (runsheetCampuses || []).filter((c) => c !== ALL_CAMPUSES) as RunsheetCampusCode[],
    [runsheetCampuses]
  );

  useEffect(() => {
    if (!showDuplicateModal) return;
    let cancelled = false;

    async function loadOptions() {
      setLoadingDuplicateOptions(true);
      try {
        const res = await getRockContentChannelOptions();
        if (cancelled) return;
        if (res.success) {
          const isGlobal = !runsheetCampuses || runsheetCampuses.includes(ALL_CAMPUSES);
          const allowed = (runsheetCampuses || []).filter((c) => c !== ALL_CAMPUSES) as RunsheetCampusCode[];

          let filteredCats = res.categories;
          if (!isGlobal && allowed.length > 0) {
            filteredCats = res.categories.filter((cat) => {
              const catCampus = extractCategoryCampus(cat.name);
              return catCampus === null || allowed.includes(catCampus);
            });
          }
          setDuplicateCategories(filteredCats);

          const currentCampus = extractRunsheetCampus(channelName);
          const matchedCat = filteredCats.find((c) => {
            const catCampus = extractCategoryCampus(c.name);
            return catCampus === currentCampus;
          });

          const defaultCatId = matchedCat ? matchedCat.id : filteredCats.length > 0 ? filteredCats[0].id : '';
          setDuplicateCategoryId((prev) => (prev !== '' ? prev : defaultCatId));
        }
      } catch (err) {
        console.error('Error loading options for duplicate modal:', err);
      } finally {
        if (!cancelled) setLoadingDuplicateOptions(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDuplicateModal]);

  useEffect(() => {
    if (!showDuplicateModal || !duplicateCategoryId) return;
    let cancelled = false;

    async function loadSchedules() {
      setLoadingDuplicateSchedules(true);
      try {
        const res = await rockGetScheduleOptions(Number(duplicateCategoryId), duplicateDate);
        if (cancelled) return;
        if (res.success && res.schedules) {
          setDuplicateSchedules(res.schedules);
          setDuplicateSession((prevSession) => {
            const exists = res.schedules.some((s) => s.name === prevSession);
            if (exists) return prevSession;
            return res.schedules.length > 0 ? res.schedules[0].name : 'AM';
          });
        }
      } catch (err) {
        console.error('Error loading schedules for duplicate modal:', err);
      } finally {
        if (!cancelled) setLoadingDuplicateSchedules(false);
      }
    }

    loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [showDuplicateModal, duplicateCategoryId, duplicateDate]);

  useEffect(() => {
    if (!showDuplicateModal) return;
    const selectedCategory = duplicateCategories.find((c) => c.id === duplicateCategoryId);
    const selectedSchedule = duplicateSchedules.find((s) => s.name === duplicateSession);
    const autoTitle = generateRunsheetTitle(
      duplicateSession,
      duplicateDate,
      selectedSchedule?.timeLabel,
      selectedCategory?.name
    );
    setDuplicateTitle(autoTitle);
  }, [showDuplicateModal, duplicateSession, duplicateDate, duplicateCategoryId, duplicateCategories, duplicateSchedules]);

  /** Global Undo / Redo history stacks */
  const [history, setHistory] = useState<RunsheetSnapshot[]>([]);
  const [future, setFuture] = useState<RunsheetSnapshot[]>([]);

  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  });

  /**
   * Keyed by row id (not array index) so deleting/reordering rows can't
   * misassign the flag. Driven solely by `songItemId` being set (persisted in
   * Rock as `SONGITEMID`; `0` means "flagged as music, no specific song
   * linked yet", distinct from `null`/absent meaning "not a music cell") —
   * no text heuristic, so an unrelated cell that happens to mention "song"
   * is never auto-flagged.
   */
  const [musicCellMap, setMusicCellMap] = useState<Record<string, boolean>>(() => {
    if (initialTemplate) return initialTemplate.templateMusicMap;

    const map: Record<string, boolean> = {};
    initialItems.forEach((item) => {
      if (item.songItemId !== null && item.songItemId !== undefined) {
        map[String(item.id)] = true;
      }
    });
    return map;
  });

  const [songModalState, setSongModalState] = useState<{
    isOpen: boolean;
    rowId?: number | string | null;
    initialValue?: string;
    initialSongItemId?: number | null;
    readOnly?: boolean;
  }>({ isOpen: false });

  const saveSnapshot = React.useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-49),
      {
        items: JSON.parse(JSON.stringify(items)),
        startTime,
        musicCellMap: { ...musicCellMap },
        deletedIds: [...deletedIds],
      },
    ]);
    setFuture([]);
  }, [items, startTime, musicCellMap, deletedIds]);

  const handleUndo = React.useCallback(() => {
    if (readOnly || history.length === 0) return;
    const previous = history[history.length - 1];
    const newHistory = history.slice(0, history.length - 1);

    setFuture((prev) => [
      {
        items: JSON.parse(JSON.stringify(items)),
        startTime,
        musicCellMap: { ...musicCellMap },
        deletedIds: [...deletedIds],
      },
      ...prev,
    ]);

    setHistory(newHistory);
    setItems(previous.items);
    setStartTime(previous.startTime);
    setMusicCellMap(previous.musicCellMap);
    setDeletedIds(previous.deletedIds);
    setEditingCell(null);
    setIsDirty(true);
  }, [readOnly, history, items, startTime, musicCellMap, deletedIds]);

  const handleRedo = React.useCallback(() => {
    if (readOnly || future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setHistory((prev) => [
      ...prev,
      {
        items: JSON.parse(JSON.stringify(items)),
        startTime,
        musicCellMap: { ...musicCellMap },
        deletedIds: [...deletedIds],
      },
    ]);

    setFuture(newFuture);
    setItems(next.items);
    setStartTime(next.startTime);
    setMusicCellMap(next.musicCellMap);
    setDeletedIds(next.deletedIds);
    setEditingCell(null);
    setIsDirty(true);
  }, [readOnly, future, items, startTime, musicCellMap, deletedIds]);

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, handleUndo, handleRedo]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleDeleteRunsheet = async () => {
    setIsDeleting(true);
    const res = await rockDeleteServiceRunsheet(channelId);
    setIsDeleting(false);
    if (res.success) {
      setShowDeleteModal(false);
      onDeleted?.();
    } else {
      alert(res.error || 'Failed to delete runsheet.');
    }
  };

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

    const runsheetItemsOnly = items.filter((item) => !(item.title && item.title.startsWith('Roster:')));

    let index = 0;
    while (index < runsheetItemsOnly.length) {
      const blockStartIndex = index;
      const duration = Number(runsheetItemsOnly[index].duration) || 0;
      const startStr = formatMinutesToTimeWithSeconds(currentMinutes);

      if (duration > 0) {
        currentMinutes += duration;
        const endStr = formatMinutesToTimeWithSeconds(currentMinutes);
        const durStr = formatDurationToHMS(duration);

        processed.push({
          ...runsheetItemsOnly[index],
          order: index + 1,
          calculatedStart: startStr,
          calculatedEnd: endStr,
          formattedDuration: durStr,
        });
        parents[index] = blockStartIndex;
        index++;

        // Zero-duration rows are sub-items of the segment above them.
        while (index < runsheetItemsOnly.length && (Number(runsheetItemsOnly[index].duration) || 0) === 0) {
          processed.push({
            ...runsheetItemsOnly[index],
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
        while (index < runsheetItemsOnly.length && (Number(runsheetItemsOnly[index].duration) || 0) === 0) {
          processed.push({
            ...runsheetItemsOnly[index],
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

  const totalDurationFormatted = useMemo(() => {
    let totalMinutes = 0;
    for (const item of items) {
      if (item.title && item.title.startsWith('Roster:')) continue;
      totalMinutes += Number(item.duration) || 0;
    }
    return formatDurationToHMS(totalMinutes);
  }, [items]);

  useEffect(() => {
    if (editingCardIndex === null) return;
    const row = processedRows[editingCardIndex];
    if (!row) return;
    setCardDurationDraft(formatDurationToHMS(Number(row.duration) || 0));
    setCardTitleDraft(htmlToPlainText(row.attributeValues?.ACTIVITYTITLE || row.title || ''));

    const attrDrafts: { [key: string]: string } = {};
    for (const col of dynamicAttrCols) {
      if (isPersonColumn(col)) continue;
      attrDrafts[col.key] = htmlToPlainText(readRunsheetCellValue(row, col.key));
    }
    setCardAttrDrafts(attrDrafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCardIndex]);

  const handleCommitCardTitleDraft = () => {
    if (editingCardIndex === null) return;
    const targetId = processedRows[editingCardIndex]?.id;
    if (targetId === undefined) return;
    handleAttrValueChange(targetId, 'title', cardTitleDraft);
  };

  const handleCommitCardAttrDraft = (colKey: string) => {
    if (editingCardIndex === null) return;
    const targetId = processedRows[editingCardIndex]?.id;
    if (targetId === undefined) return;
    handleAttrValueChange(targetId, colKey, cardAttrDrafts[colKey] ?? '');
  };

  const handleCommitCardDurationDraft = () => {
    if (editingCardIndex === null) return;
    const targetId = processedRows[editingCardIndex]?.id;
    if (targetId === undefined) return;
    const val = parseDurationInputToMinutes(cardDurationDraft);
    setItems((previous) => {
      const idx = previous.findIndex((it) => it.id === targetId);
      if (idx === -1) return previous;
      const updated = [...previous];
      updated[idx] = { ...updated[idx], duration: val };
      return updated;
    });
    setIsDirty(true);
  };

  /** Attribute columns sorted with Person columns first for mobile cards. */
  const sortedAttrCols = useMemo(() => {
    return [...dynamicAttrCols].sort((a, b) => {
      const aIsPerson = isPersonColumn(a);
      const bIsPerson = isPersonColumn(b);
      if (aIsPerson && !bIsPerson) return -1;
      if (!aIsPerson && bIsPerson) return 1;
      return 0;
    });
  }, [dynamicAttrCols]);

  const handleAttrValueChange = (itemId: number | string, key: string, value: string) => {
    if (readOnly) return;
    saveSnapshot();
    setItems((previous) => {
      const updated = [...previous];
      const index = updated.findIndex((it) => it.id === itemId);
      if (index === -1) return previous;
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

  /**
   * Same as `handleAttrValueChange` for the title, but also persists the
   * linked Song's Rock id. Only reachable while the cell is already a music
   * cell, so a missing link (custom text with no Rock match) still saves as
   * `0` — flagged as music, just not tied to a specific song — rather than
   * `null`, which would silently drop the row's music status.
   */
  const handleSelectSong = (itemId: number | string, formattedSong: string, songItemId: number | null) => {
    if (readOnly) return;
    saveSnapshot();
    setItems((previous) => {
      const updated = [...previous];
      const index = updated.findIndex((it) => it.id === itemId);
      if (index === -1) return previous;
      const item = { ...updated[index] };
      item.title = formattedSong;
      item.attributeValues = { ...(item.attributeValues || {}), ACTIVITYTITLE: formattedSong };
      item.songItemId = songItemId ?? 0;
      updated[index] = item;
      return updated;
    });

    setIsDirty(true);
  };

  const handleCommitDurationDrafts = () => {
    if (readOnly || editingDurationBlockIndex === null) return;
    saveSnapshot();

    // `durationDrafts` is keyed by row id, not by its position in `processedRows`
    // — that position doesn't match a row's slot in the raw `items` array (which
    // also holds hidden "Roster: ..." placeholder rows), especially after a
    // drag reorder. Writing by `items[index]` there would silently edit
    // whatever row happens to occupy that raw slot instead of the one shown.
    setItems((previous) =>
      previous.map((item) => {
        const draft = durationDrafts[String(item.id)];
        return draft === undefined ? item : { ...item, duration: parseDurationInputToMinutes(draft) };
      })
    );

    setIsDirty(true);
    setEditingDurationBlockIndex(null);
    setDurationDrafts({});
  };

  const handleAddRow = () => {
    if (readOnly) return;
    saveSnapshot();
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

    setItems((previous) => {
      // Auto-injected "Roster: ..." placeholders trail every real segment, so a
      // plain push would land the new row after them instead of at the visible
      // end of the runsheet — insert just before that roster block instead.
      const rosterStartIndex = previous.findIndex((item) => item.title && item.title.startsWith('Roster:'));
      const insertIndex = rosterStartIndex === -1 ? previous.length : rosterStartIndex;
      const updated = [...previous];
      updated.splice(insertIndex, 0, newRow);
      return updated;
    });
    setIsDirty(true);
    setEditingCell({ itemId: newRow.id, key: 'title' });
  };

  const applyDefaultTemplate = () => {
    saveSnapshot();
    const { templateRows, templateMusicMap } = buildTemplateState();
    const rosterItems = items.filter((item) => item.title && item.title.startsWith('Roster:'));

    setDeletedIds((previous) => [...previous, ...items.filter((item) => !(item.title && item.title.startsWith('Roster:'))).map((item) => item.id)]);
    setItems(ensureRosterItems([...templateRows, ...rosterItems]));
    setMusicCellMap(templateMusicMap);
    setEditingCell(null);
    setIsDirty(true);
    setStatus({ type: 'idle' });
  };

  const handleResetFormClick = () => {
    if (readOnly) return;
    setShowResetModal(true);
  };

  const handleConfirmResetForm = () => {
    applyDefaultTemplate();
    setShowResetModal(false);
  };

  const handleDeleteRow = (id: number | string) => {
    if (readOnly) return;
    saveSnapshot();
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

  /**
   * Moves the item with `draggedId` to sit where `targetId` currently is.
   * Resolved by stable id rather than array index, since a row's position in
   * `items` (which also holds hidden "Roster: ..." placeholder rows) doesn't
   * necessarily match its position in the roster-filtered, user-visible list.
   */
  const moveItemById = (draggedId: number | string, targetId: number | string) => {
    saveSnapshot();
    setItems((previous) => {
      const updated = [...previous];
      const fromIndex = updated.findIndex((item) => item.id === draggedId);
      if (fromIndex === -1) return previous;
      const [moved] = updated.splice(fromIndex, 1);
      const toIndex = updated.findIndex((item) => item.id === targetId);
      updated.splice(toIndex === -1 ? fromIndex : toIndex, 0, moved);
      return updated;
    });
    setIsDirty(true);
  };

  const handleDrop = (targetIndex: number) => {
    if (readOnly || draggedIndex === null || draggedIndex === targetIndex) return;

    // Both indices are positions within the roster-filtered `processedRows`,
    // not the raw `items` array — resolve by stable id so a dragged row always
    // lands next to the row the user actually dropped it on, even when roster
    // placeholder rows have thrown off a plain index-to-index splice.
    const draggedId = processedRows[draggedIndex]?.id;
    const targetId = processedRows[targetIndex]?.id;
    if (draggedId === undefined || targetId === undefined) return;

    moveItemById(draggedId, targetId);
    setDraggedIndex(null);
    setEditingCell(null);
  };

  /**
   * Up/down reorder for the mobile Card view, where HTML5 drag-and-drop doesn't
   * work reliably on touch. A direct swap by id, not `moveItemById` — that
   * helper's "remove then insert before the target's post-removal slot" logic
   * correctly swaps adjacent rows moving up, but is a no-op moving down: removing
   * the dragged row shifts the very-next target back by exactly the one slot
   * being inserted into, landing the dragged row right back where it started.
   */
  const handleMoveCard = (index: number, direction: 'up' | 'down') => {
    if (readOnly) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= processedRows.length) return;

    const draggedId = processedRows[index]?.id;
    const targetId = processedRows[targetIndex]?.id;
    if (draggedId === undefined || targetId === undefined) return;

    saveSnapshot();
    setItems((previous) => {
      const updated = [...previous];
      const fromIndex = updated.findIndex((item) => item.id === draggedId);
      const toIndex = updated.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return previous;
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      return updated;
    });
    setIsDirty(true);
  };

  const handleConfirmDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTitle.trim()) {
      setDuplicateError('Please enter a target runsheet title.');
      return;
    }

    const finalTitle = duplicateTitle.trim();
    if (!isGlobalStaffOrAdmin && userAllowedCampuses.length > 0) {
      const titleCampus = extractRunsheetCampus(finalTitle);
      if (titleCampus && !userAllowedCampuses.includes(titleCampus)) {
        setDuplicateError(`You are only authorized to create runsheets for your assigned campus (${userAllowedCampuses.join(', ')}).`);
        return;
      }
    }

    setIsDuplicating(true);
    setDuplicateError('');

    const runsheetPreparedItems = processedRows.map((row) => ({ ...row, startDateTime: row.calculatedStart }));
    const rosterPreparedItems = items.filter((item) => item.title && item.title.startsWith('Roster:'));
    const allPreparedItems = [...runsheetPreparedItems, ...rosterPreparedItems];

    const res = await rockDuplicateServiceRunsheet(
      finalTitle,
      13,
      duplicateCategoryId ? Number(duplicateCategoryId) : undefined,
      allPreparedItems,
      columns
    );

    setIsDuplicating(false);

    if (res.success && res.id) {
      setShowDuplicateModal(false);
      onCreated?.(res.id, finalTitle, res.data);
    } else {
      setDuplicateError(res.error || 'Failed to duplicate runsheet.');
    }
  };

  const computeDiffPayload = React.useCallback(() => {
    const runsheetPreparedItems = processedRows.map((row) => ({ ...row, startDateTime: row.calculatedStart }));
    const rosterPreparedItems = items.filter((item) => item.title && item.title.startsWith('Roster:'));
    const allPreparedItems = [...runsheetPreparedItems, ...rosterPreparedItems];

    const itemsToSave: RunsheetItemRow[] = [];

    allPreparedItems.forEach((item) => {
      const isNewItem = typeof item.id === 'string' || item.isNew;
      if (isNewItem) {
        // Auto-injected roster placeholders (e.g. "Roster: Music Director") keep a
        // stable synthetic id and get a baseline fingerprint on load even though
        // they're flagged `isNew` — if nothing about them has changed since, they
        // aren't a real pending save and shouldn't mark the runsheet dirty.
        const rosterBaseline = baselineRef.current.get(item.id);
        if (rosterBaseline) {
          const fingerprint = createRowFingerprint(item);
          if (JSON.stringify(fingerprint) === JSON.stringify(rosterBaseline)) {
            return;
          }
        }
        // New items are sent in full without changedKeys
        itemsToSave.push({ ...item });
        return;
      }

      const baseline = baselineRef.current.get(item.id);
      if (!baseline) {
        // If not in baseline, treat as requiring save
        itemsToSave.push({ ...item });
        return;
      }

      const changedKeys: string[] = [];

      // Check title / ACTIVITYTITLE
      const richTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
      if (richTitle !== baseline.title) {
        changedKeys.push('title');
        changedKeys.push('ACTIVITYTITLE');
      }

      // Check order
      if (item.order !== baseline.order) {
        changedKeys.push('order');
      }

      // startDateTime is not compared directly: by the time `item` reaches this
      // diff, its startDateTime has been overwritten with `calculatedStart` (a
      // derived "9:00:00 AM" clock string), while baseline.startDateTime holds
      // the original ISO timestamp loaded from Rock — the two are never in the
      // same format, so a naive equality check always reports a change even
      // when nothing moved. Order and duration (checked above/below) already
      // fully determine the calculated start, so they alone are sufficient.

      // Check duration
      if ((item.duration || 0) !== baseline.duration) {
        changedKeys.push('DURATION');
        changedKeys.push('duration');
      }

      // Check songItemId
      if ((item.songItemId ?? null) !== baseline.songItemId) {
        changedKeys.push('SONGITEMID');
        changedKeys.push('songItemId');
      }

      // Check attribute values
      const currentAttrs = item.attributeValues || {};
      const baselineAttrs = baseline.attributeValues || {};

      const allKeys = new Set([...Object.keys(currentAttrs), ...Object.keys(baselineAttrs)]);
      allKeys.forEach((key) => {
        if (key === 'ACTIVITYTITLE') return;
        const curVal = currentAttrs[key] ?? '';
        const baseVal = baselineAttrs[key] ?? '';
        if (curVal !== baseVal) {
          if (!changedKeys.includes(key)) {
            changedKeys.push(key);
          }
        }
      });

      if (changedKeys.length > 0) {
        itemsToSave.push({ ...item, changedKeys });
      }
    });

    return { allPreparedItems, itemsToSave };
  }, [processedRows, items]);

  // Derived dirty state
  const computedDirtyState = useMemo(() => {
    if (initialTemplate) return true;
    if (deletedIds.length > 0) return true;
    if (subtitle !== normalizedInitialSubtitle) return true;
    if (startTime !== initialStartTime) return true;
    const { itemsToSave } = computeDiffPayload();
    return itemsToSave.length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletedIds.length, subtitle, normalizedInitialSubtitle, startTime, initialStartTime, initialTemplate, computeDiffPayload, baselineVersion]);

  useEffect(() => {
    setIsDirty(computedDirtyState);
  }, [computedDirtyState]);

  /**
   * Fetches sibling data, builds the match/propagation plan, and opens the
   * review. Only ever triggered by an explicit "Review" click on the bar —
   * a save never opens this on its own.
   */
  const openPropagateReview = React.useCallback(
    async (siblings: SiblingChannel[], candidatesToReview: CandidateCellChange[]) => {
      const batch = await rockGetRunsheetDetailsBatch(siblings.map((s) => s.channelId));
      const targetRowsMap = new Map<number, RunsheetItemRow[]>();
      const matchResultsByChannel = new Map<number, MatchResult>();

      // Sibling sheets haven't seen this save's edits yet, so a row renamed in
      // it must be matched under its OLD title — matching under the new one
      // would find nothing there and silently drop every change on that row.
      const matchingSourceRows = processedRows.map((row) => {
        const oldTitle = typeof row.id === 'number' ? propagateOldTitlesRef.current.get(row.id) : undefined;
        if (oldTitle === undefined) return row;
        return { ...row, title: oldTitle, attributeValues: { ...row.attributeValues, ACTIVITYTITLE: oldTitle } };
      });

      for (const result of batch) {
        if (!result.success || !result.data) continue;
        targetRowsMap.set(result.channelId, result.data.items);
        matchResultsByChannel.set(result.channelId, matchRows(matchingSourceRows, result.channelId, result.data.items));
      }

      setPropagateTargetRows(targetRowsMap);
      const plan = buildPropagationPlan(candidatesToReview, matchResultsByChannel, siblings, columns);
      setPropagatePlan(plan);
      setPropagateReviewOpen(true);
    },
    [processedRows, columns]
  );

  const handleSave = React.useCallback(async (): Promise<boolean> => {
    if (readOnly) return false;
    setStatus({ type: 'saving' });
    setEditingCell(null);

    const { allPreparedItems, itemsToSave } = computeDiffPayload();
    const startTimeChanged = startTime !== initialStartTime;

    // If nothing changed, return success early
    if (itemsToSave.length === 0 && deletedIds.length === 0 && subtitle === normalizedInitialSubtitle && !startTimeChanged) {
      setStatus({ type: 'success', message: 'No changes to save.' });
      setIsDirty(false);
      return true;
    }

    let result: Awaited<ReturnType<typeof rockBulkSaveRunsheetItems>>;
    try {
      result = await rockBulkSaveRunsheetItems(
        channelId,
        itemsToSave,
        deletedIds,
        columns,
        subtitle,
        startTimeChanged ? startTime : undefined
      );
    } catch (err: any) {
      onSaveSettled?.(channelId);
      setStatus({ type: 'error', message: err?.message || 'Failed to save changes.' });
      return false;
    }

    if (result.success) {
      // Snapshot propagation candidates against the PRE-save baseline before
      // it gets advanced below — advancing first would make `previousValue`
      // equal `newValue` for every cell, since baselineRef would already
      // hold the just-saved value by the time this reads from it.
      const candidates: CandidateCellChange[] = [];
      // A row whose title changed in this very save is caught here too — the
      // target sibling hasn't seen the rename yet, so matching by title text
      // would fail. Its pre-edit title is stashed for handleOpenPropagateReview
      // to match against, while candidates themselves carry the row's id so
      // matching never depends on title text at all.
      const oldTitlesForMatching = new Map<number, string>();
      for (const item of itemsToSave) {
        if (typeof item.id === 'string' || item.isNew) continue;
        const baseline = baselineRef.current.get(item.id);
        if (!baseline) continue;
        const newTitle = item.attributeValues?.ACTIVITYTITLE || item.title || '';
        if (newTitle !== baseline.title) {
          oldTitlesForMatching.set(item.id, baseline.title);
        }
        for (const key of item.changedKeys || []) {
          if (key === 'title' || key === 'order' || key === 'startDateTime' || key === 'duration' || key === 'songItemId') continue;
          const column = columns.find((c) => c.key === key);
          candidates.push({
            itemId: item.id,
            itemTitle: newTitle,
            columnKey: key,
            columnName: column?.name || key,
            newValue: item.attributeValues?.[key] ?? '',
            previousValue: baseline.attributeValues?.[key] ?? '',
          });
        }
      }
      propagateOldTitlesRef.current = oldTitlesForMatching;

      // Advance baseline for all saved items
      (result.results || []).forEach((res) => {
        if (res.ok && res.rockId) {
          const item = allPreparedItems.find((it) => it.id === res.clientId);
          if (item) {
            const updatedItem: RunsheetItemRow = { ...item, id: res.rockId, isNew: false };
            baselineRef.current.set(res.rockId, createRowFingerprint(updatedItem));

            // If it was a new item with a string id, update local item id state
            if (typeof res.clientId === 'string') {
              setItems((prev) =>
                prev.map((it) => (it.id === res.clientId ? { ...it, id: res.rockId!, isNew: false } : it))
              );
            }
          }
        }
      });

      setStatus({ type: 'success', message: 'Favor Runsheet successfully saved to Rock RMS!' });
      setIsDirty(false);
      setDeletedIds([]);

      const optimisticItems = allPreparedItems
        .map((item) => {
          const savedResult = (result.results || []).find((res) => res.ok && res.clientId === item.id);
          return savedResult?.rockId ? { ...item, id: savedResult.rockId, isNew: false } : { ...item, isNew: false };
        })
        .filter((item) => !deletedIds.includes(item.id));
      onOptimisticSave?.({
        channelId,
        name: channelName,
        subtitle,
        startTime,
        contentChannelTypeId: 13,
        columns,
        items: optimisticItems,
      });
      onSaveSettled?.(channelId);

      if (candidates.length > 0) {
        const channelsRes = await rockGetAvailableRunsheetChannels(false);
        if (channelsRes.success) {
          const siblings = resolveSiblings(channelId, channelName, channelsRes.channels);
          if (siblings.length > 0) {
            setPropagateSiblings(siblings);
            setPropagateCandidates(candidates);
            setPropagateBarDismissed(false);
            // Show the bar and wait for an explicit "Review" click before
            // opening anything — the review no longer opens on its own.
          }
        }
      }

      return true;
    } else {
      // Partial or total failure: advance baseline only for succeeded items
      let successCount = 0;
      let failCount = 0;

      (result.results || []).forEach((res) => {
        if (res.ok && res.rockId) {
          successCount++;
          const item = allPreparedItems.find((it) => it.id === res.clientId);
          if (item) {
            const updatedItem: RunsheetItemRow = { ...item, id: res.rockId, isNew: false };
            baselineRef.current.set(res.rockId, createRowFingerprint(updatedItem));

            if (typeof res.clientId === 'string') {
              setItems((prev) =>
                prev.map((it) => (it.id === res.clientId ? { ...it, id: res.rockId!, isNew: false } : it))
              );
            }
          }
        } else if (!res.ok) {
          failCount++;
        }
      });

      const message =
        failCount > 0
          ? `Saved ${successCount} of ${itemsToSave.length} segments; ${failCount} failed. Click Save to retry.`
          : result.error || 'Failed to save changes.';

      setStatus({ type: 'error', message });
      onSaveSettled?.(channelId);
      return false;
    }
  }, [readOnly, computeDiffPayload, deletedIds, subtitle, normalizedInitialSubtitle, startTime, initialStartTime, channelId, channelName, columns, createRowFingerprint, onOptimisticSave, onSaveSettled]);

  useEffect(() => {
    onSaveRef?.(handleSave);
  }, [onSaveRef, handleSave]);

  const handleOpenPropagateReview = React.useCallback(
    () => openPropagateReview(propagateSiblings, propagateCandidates),
    [openPropagateReview, propagateSiblings, propagateCandidates]
  );

  /**
   * The checkbox is per CHANGE, not per service — checking it selects that
   * change for every matched sibling at once (unmatched ones have nothing to
   * apply and stay excluded regardless).
   */
  const handlePropagateToggleGroup = React.useCallback((itemTitle: string, columnKey: string, nextSelected: boolean) => {
    setPropagatePlan((prev) => {
      if (!prev) return prev;
      return {
        targets: prev.targets.map((t) => ({
          ...t,
          changes: t.changes.map((c) =>
            c.itemTitle === itemTitle && c.columnKey === columnKey && c.status !== 'unmatched'
              ? { ...c, selected: nextSelected }
              : c,
          ),
        })),
      };
    });
  }, []);

  const handlePropagateApply = React.useCallback(async () => {
    if (!propagatePlan) return;
    setPropagateApplying(true);
    try {
      const outcomes = await executePropagationPlan(propagatePlan, propagateTargetRows, columns);
      setPropagateOutcomes(outcomes);
      if (outcomes.every((o) => o.ok)) {
        setPropagateReviewOpen(false);
        setPropagateBarDismissed(true);
      }
    } finally {
      setPropagateApplying(false);
    }
  }, [propagatePlan, propagateTargetRows, columns]);

  // The template auto-fill above only sets local (dirty) state — without
  // this, a freshly created runsheet's template exists only in the browser
  // until someone remembers to click Save, and is lost entirely if they
  // navigate away first. Auto-saving here guarantees it actually lands in
  // Rock the moment the runsheet is opened.
  const handleSaveRef = React.useRef(handleSave);
  handleSaveRef.current = handleSave;

  const didAutoSaveTemplate = React.useRef(false);
  useEffect(() => {
    if (didAutoSaveTemplate.current || !initialTemplate) return;
    didAutoSaveTemplate.current = true;
    handleSaveRef.current();
  }, [initialTemplate]);

  const handleSaveCard = React.useCallback(
    (index: number) => {
      const targetItem = processedRows[index];
      const targetId = targetItem?.id;

      setEditingCardIndex(null);
      if (isDirty) {
        handleSaveRef.current();
      }

      if (targetId !== undefined) {
        setTimeout(() => {
          const el = document.getElementById(`card_item_${targetId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    },
    [processedRows, isDirty]
  );

  const closeCell = (itemId: number | string, key: string) => {
    setEditingCell((current) => (current?.itemId === itemId && current?.key === key ? null : current));
    if (mobileViewMode === 'cards') {
      setTimeout(() => {
        handleSaveRef.current();
      }, 100);
    }
  };

  const renderCellContent = (
    rowId: number | string,
    key: string,
    value: string,
    isPersonField = false,
    songItemId: number | null = null,
    forceEdit = false,
  ) => {
    const isActivityTitleColumn = key === 'title';
    const musicCellId = String(rowId);
    const isMusicCell = isActivityTitleColumn && !!musicCellMap[musicCellId];
    const isEditing = !readOnly && (forceEdit || (editingCell?.itemId === rowId && editingCell?.key === key));

    if (isEditing) {
      if (isMusicCell) {
        return (
          <div className="relative">
            <SongSearchDropdown
              initialValue={value ?? ''}
              initialSongItemId={songItemId}
              onSelectSong={(formattedSong, selectedSongId) => {
                handleSelectSong(rowId, formattedSong, selectedSongId);
                if (!forceEdit) closeCell(rowId, key);
              }}
              onOpenFullModal={() => {
                if (!forceEdit) closeCell(rowId, key);
                setSongModalState({
                  isOpen: true,
                  rowId,
                  initialValue: value ?? '',
                  initialSongItemId: songItemId,
                  readOnly,
                });
              }}
              onClose={() => !forceEdit && closeCell(rowId, key)}
            />
          </div>
        );
      }

      if (isPersonField) {
        return (
          <PeopleSearchDropdown
            initialValue={value ?? ''}
            onSelectPerson={(selectedName) => handleAttrValueChange(rowId, key, selectedName)}
            onClose={() => !forceEdit && closeCell(rowId, key)}
          />
        );
      }

      return (
        <RichTextCell
          value={value ?? ''}
          onChange={(html) => handleAttrValueChange(rowId, key, html)}
          onCommit={() => !forceEdit && closeCell(rowId, key)}
          onEditorChange={setActiveEditor}
        />
      );
    }

    return (
      <div className="group relative w-full h-full flex flex-col justify-center">
        {!readOnly && isActivityTitleColumn && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const turningOff = isMusicCell;
              setMusicCellMap((prev) => ({
                ...prev,
                [musicCellId]: !prev[musicCellId],
              }));
              // Persist the flag immediately (not just in local UI state), so a
              // music cell the user never reopens to pick a song still saves
              // as one — `0` means "flagged, no specific song linked yet".
              setItems((previous) => {
                const updated = [...previous];
                const targetIdx = updated.findIndex((it) => it.id === rowId);
                if (targetIdx !== -1) {
                  updated[targetIdx] = { ...updated[targetIdx], songItemId: turningOff ? null : 0 };
                }
                return updated;
              });
              setIsDirty(true);
            }}
            className={`absolute top-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded transition-all cursor-pointer ${isMusicCell
                ? 'bg-slate-900 text-white shadow-xs hover:bg-black ring-1 ring-slate-700'
                : 'bg-slate-100/90 text-slate-400 hover:bg-slate-200 hover:text-slate-900 opacity-0 group-hover:opacity-100'
              }`}
            title={isMusicCell ? 'Music Cell (Click to toggle off)' : 'Mark cell as Music / Song'}
          >
            <HiMusicalNote className="h-3 w-3" />
          </button>
        )}

        <div
          className={`relative min-h-[24px] w-full h-full flex flex-col justify-center px-2 py-0.5 text-[11px] leading-normal text-slate-900 transition-all ${isMusicCell
              ? 'bg-slate-100/90 border-2 border-slate-400/80 text-slate-950 font-bold ring-1 ring-slate-300 shadow-xs pr-7'
              : readOnly
                ? 'cursor-default'
                : 'cursor-text'
            }`}
          title={
            readOnly
              ? 'Read-only volunteer view'
              : isMusicCell
                ? 'Music Cell - Click to search songs & set key'
                : isPersonField
                  ? 'Click to search Rock for a person'
                  : 'Click to edit'
          }
        >
          {isMusicCell && value ? (
            <div className="flex items-center gap-1 font-semibold text-slate-950">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSongModalState({
                    isOpen: true,
                    rowId,
                    initialValue: value ?? '',
                    initialSongItemId: songItemId,
                    readOnly,
                  });
                }}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-200/90 text-slate-800 hover:bg-slate-300 hover:text-slate-950 transition-colors cursor-pointer"
                title="Click to view song details and charts"
                aria-label="View song details"
              >
                <HiMusicalNote className="h-2.5 w-2.5" />
              </button>
              <RichTextContent value={value ?? ''} />
            </div>
          ) : isPersonField && value ? (
            <div className="flex flex-wrap items-center gap-1 font-medium text-slate-900">
              {parsePeopleString(value).map((person, i, arr) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span>{person.name}</span>
                  {person.isGuest && (
                    <span className="rounded bg-amber-100 text-amber-900 px-1 py-0.2 text-[10px] font-bold border border-amber-300">
                      Guest
                    </span>
                  )}
                  {i < arr.length - 1 && <span className="text-slate-400 mr-0.5">,</span>}
                </span>
              ))}
            </div>
          ) : (
            <RichTextContent value={value ?? ''} />
          )}
        </div>
      </div>
    );
  };

  function getColumnStyle(_key: string, _name: string): React.CSSProperties {
    return { width: '100px', minWidth: '85px' };
  }

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
      {/* Sticky Locked Header & Toolbar Container — sits just below the app's own sticky nav header (stickyTopOffset), not also at top:0, or the two would overlap. */}
      <div
        style={{ top: stickyTopOffset }}
        className="sticky z-40 bg-white/95 backdrop-blur border-b border-slate-300 p-1.5 sm:p-2 shadow-xs space-y-1 rounded-t-xl -mx-2 -mt-2 sm:-mx-3 sm:-mt-3"
      >
        <div className="flex flex-col justify-between gap-1.5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold leading-tight text-slate-900">{channelName}</h2>
              {readOnly && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-bold text-amber-900 border border-amber-300">
                  <HiLockClosed className="h-3 w-3 text-amber-700" />
                  Read Only
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-col items-start gap-0.5">
              <div className="inline-grid grid-cols-1 items-center rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs sm:text-sm font-medium text-white shadow-xs transition-all focus-within:border-slate-600 focus-within:ring-2 focus-within:ring-slate-700">
                <span className="col-start-1 row-start-1 text-xs sm:text-sm font-medium text-transparent select-none whitespace-pre pointer-events-none px-0.5">
                  {subtitle || 'Sunday Service'}
                </span>
                <input
                  type="text"
                  disabled={readOnly}
                  value={subtitle}
                  onChange={(e) => {
                    setSubtitle(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Sunday Service"
                  className="col-start-1 row-start-1 w-full bg-transparent text-xs sm:text-sm font-medium text-white placeholder:text-white focus:outline-none disabled:bg-transparent px-0.5"
                />
              </div>
              {!readOnly && (
                <span className="text-[9px] font-semibold text-slate-500 select-none">
                  (Click to edit subtitle)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
              <label className="whitespace-nowrap text-[11px] font-semibold text-slate-700" htmlFor="runsheet-start-time">
                Start:
              </label>
              <input
                id="runsheet-start-time"
                type="text"
                disabled={readOnly}
                className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                value={startTime}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  setIsDirty(true);
                }}
                placeholder="08:00:00 AM"
              />
            </div>

            <div role="group" aria-label="Layout view mode" className="flex items-center rounded-md border border-slate-300 bg-slate-100 p-0.5">
              <button
                type="button"
                aria-label="Card view"
                title="Card view"
                aria-pressed={mobileViewMode === 'cards'}
                onClick={() => setMobileViewMode('cards')}
                className={`flex items-center justify-center rounded p-1 transition-all cursor-pointer ${mobileViewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <HiRectangleStack className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Table view"
                title="Table view"
                aria-pressed={mobileViewMode === 'grid'}
                onClick={() => setMobileViewMode('grid')}
                className={`flex items-center justify-center rounded p-1 transition-all cursor-pointer ${mobileViewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <HiTableCells className="h-3.5 w-3.5" />
              </button>
            </div>

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Undo (⌘Z)"
                >
                  <HiArrowUturnLeft className="h-3.5 w-3.5 text-slate-700" />
                  <span>Undo</span>
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={future.length === 0}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Redo (⌘⇧Z)"
                >
                  <HiArrowUturnRight className="h-3.5 w-3.5 text-slate-700" />
                  <span>Redo</span>
                </button>

                <button
                  onClick={handleResetFormClick}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100"
                  title="Reset to the standard Favor Runsheet template"
                >
                  <HiArrowPath className="h-3.5 w-3.5 text-blue-600" />
                  <span>Reset Form</span>
                </button>

                <button
                  onClick={handleAddRow}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100"
                >
                  <HiPlus className="h-3.5 w-3.5 text-blue-600" />
                  <span>Add Row</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDuplicateError('');
                    setShowDuplicateModal(true);
                  }}
                  className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-900 hover:bg-slate-200 active:bg-slate-300 transition-colors"
                  title="Duplicate current runsheet as a different service time"
                >
                  <HiDocumentDuplicate className="h-3.5 w-3.5 text-slate-700" />
                  <span>Duplicate</span>
                </button>

                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 focus:outline-none"
                  title="Delete this Runsheet"
                >
                  <HiTrash className="h-3.5 w-3.5 text-rose-600" />
                  <span>Delete</span>
                </button>

                <button
                  onClick={handleSave}
                  disabled={status.type === 'saving' || !isDirty}
                  className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-pink-700 px-3 text-[11px] font-semibold text-white hover:bg-pink-800 focus:outline-none active:bg-pink-900 disabled:opacity-40"
                >
                  <HiCheck className="h-3.5 w-3.5" />
                  <span>{status.type === 'saving' ? 'Saving...' : 'Save Runsheet'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Formatting bar for whichever cell is open (hidden in read-only mode) */}
        {!readOnly && <RichTextToolbar editor={activeEditor} />}
      </div>

      {/* Duplicate Runsheet Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Duplicate Runsheet</h3>
            <p className="mt-1 text-xs text-slate-600">
              Duplicate all segments from <span className="font-semibold text-slate-900">&quot;{channelName}&quot;</span> into a new runsheet for a different service time or date.
            </p>

            {duplicateError && (
              <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800 border border-rose-200">
                {duplicateError}
              </div>
            )}

            {loadingDuplicateOptions ? (
              <div className="py-6 text-center text-xs font-medium text-slate-500">
                Loading options from Rock RMS...
              </div>
            ) : (
              <form onSubmit={handleConfirmDuplicate} className="mt-4 flex flex-col gap-3 text-xs">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Category</label>
                  <select
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
                    value={duplicateCategoryId}
                    onChange={(e) => setDuplicateCategoryId(e.target.value ? Number(e.target.value) : '')}
                  >
                    {duplicateCategories.length === 0 && <option value="" disabled>No Categories Available</option>}
                    {duplicateCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Target Date</label>
                  <input
                    type="date"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
                    value={duplicateDate}
                    onChange={(e) => setDuplicateDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Target Service Schedule / Time Event
                  </label>
                  <select
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
                    value={duplicateSession}
                    disabled={loadingDuplicateSchedules}
                    onChange={(e) => setDuplicateSession(e.target.value)}
                  >
                    {loadingDuplicateSchedules ? (
                      <option value="">Loading existing service times from Rock...</option>
                    ) : duplicateSchedules.length > 0 ? (
                      duplicateSchedules.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name} ({s.timeLabel})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                        <option value="All Day">All Day</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Duplicated Runsheet Title
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-xs font-bold text-slate-950 focus:border-slate-900 focus:bg-white focus:outline-none"
                    value={duplicateTitle}
                    onChange={(e) => setDuplicateTitle(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Auto-generated from schedule & date. You can fine-tune this title before duplicating.
                  </p>
                  <div className="mt-3 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDuplicateModal(false)}
                      disabled={isDuplicating}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDuplicating}
                      className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-black cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      {isDuplicating ? 'Duplicating...' : 'Duplicate Runsheet'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Resetting Form */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Reset Runsheet Form?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to reset this runsheet to the standard Favor Church template? Any unsaved edits to your segments will be lost.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetForm}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
              >
                Yes, Reset Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting Runsheet */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Delete Entire Runsheet?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-900">&quot;{channelName}&quot;</span> from Rock RMS? This action cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRunsheet}
                disabled={isDeleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Runsheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Row Confirmation Modal */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Delete Row?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-900">&quot;{rowToDelete.title || 'Untitled Segment'}&quot;</span>? This action can be undone with Undo (⌘Z).
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rowToDelete) {
                    handleDeleteRow(rowToDelete.id);
                    setRowToDelete(null);
                  }
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer shadow-xs"
              >
                Delete Row
              </button>
            </div>
          </div>
        </div>
      )}

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

      {propagateCandidates.length > 0 && !propagateBarDismissed && !propagateReviewOpen && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-900 shadow-xs">
          <span>
            {propagateSiblings.length} other {extractChannelDateLabel(channelName)} service
            {propagateSiblings.length === 1 ? '' : 's'} — apply your {propagateCandidates.length} change
            {propagateCandidates.length === 1 ? '' : 's'}?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPropagateReview}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer shadow-2xs"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => setPropagateBarDismissed(true)}
              className="rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {propagateReviewOpen && propagatePlan && (
        <PropagateReviewPanel
          plan={propagatePlan}
          onToggleGroup={handlePropagateToggleGroup}
          onApply={handlePropagateApply}
          onClose={() => {
            // The review now opens automatically right after save, so the
            // blue bar is really just a leftover trigger for it — closing
            // the review via X should dismiss the whole flow, not leave that
            // bar sitting around to reopen the same (now-stale) review.
            setPropagateReviewOpen(false);
            setPropagateBarDismissed(true);
          }}
          applying={propagateApplying}
          outcomes={propagateOutcomes}
        />
      )}

      {/* Event Team Roster Card */}
      <EventTeamRosterCard
        items={items}
        columns={dynamicAttrCols}
        readOnly={readOnly}
        editingRoleTitle={
          editingCell
            ? items.find((it) => it.id === editingCell.itemId)?.title?.startsWith('Roster:')
              ? items.find((it) => it.id === editingCell.itemId)?.title || null
              : null
            : null
        }
        onOpenRolePicker={(roleTitle) => {
          const personKey = columns.find(isPersonColumn)?.key || columns[0]?.key || 'PLATFORM';
          const targetItem = items.find((item) => item.title === roleTitle);
          if (targetItem) {
            setEditingCell({ itemId: targetItem.id, key: personKey });
          }
        }}
        renderPeoplePicker={(roleTitle) => {
          const personKey = columns.find(isPersonColumn)?.key || columns[0]?.key || 'PLATFORM';
          const targetItem = items.find((item) => item.title === roleTitle);
          if (!targetItem) return null;
          const currentVal = readRunsheetCellValue(targetItem, personKey);

          return (
            <PeopleSearchDropdown
              initialValue={currentVal}
              onSelectPerson={(selectedName) => handleAttrValueChange(targetItem.id, personKey, selectedName)}
              onClose={() => closeCell(targetItem.id, personKey)}
            />
          );
        }}
      />

      {/* Spreadsheet Table View */}
      <div className={`w-full max-w-full min-w-0 flex flex-col gap-1.5 ${mobileViewMode === 'cards' ? 'hidden' : 'block'}`}>
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow-xs">
              <HiTableCells className="h-3.5 w-3.5 text-slate-300" />
              Runsheet Schedule
            </span>
            <span className="text-xs font-semibold text-slate-600">
              ({processedRows.length} segments)
            </span>
          </div>
        </div>

        <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-xs">
          <table className="w-full min-w-full border-collapse bg-white text-[11px] text-slate-900" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-30 bg-slate-900 text-white shadow-xs">
              <tr className="border-b-2 border-slate-950 text-left font-semibold text-white text-xs tracking-normal">
                {!readOnly && <th className="sticky top-0 z-30 bg-slate-900 border-r border-slate-800 p-1 text-center" style={{ width: '28px', minWidth: '28px' }} />}
                <th className="sticky top-0 z-30 bg-slate-900 border-r border-slate-800 p-1 text-center font-semibold whitespace-nowrap select-none text-slate-100" style={{ width: '64px', minWidth: '58px' }}>
                  Start
                </th>
                <th className="sticky top-0 z-30 bg-slate-900 border-r border-slate-800 p-1 text-center font-semibold whitespace-nowrap select-none text-slate-100" style={{ width: '64px', minWidth: '58px' }}>
                  Duration
                </th>
                <th className="sticky top-0 z-30 bg-slate-900 border-r border-slate-800 p-1 text-center font-semibold whitespace-nowrap select-none text-slate-100" style={{ width: '140px', minWidth: '110px' }}>
                  Activity Title
                </th>

                {dynamicAttrCols.map((col) => (
                  <th
                    key={col.id}
                    className="sticky top-0 z-30 bg-slate-900 border-r border-slate-800 p-1 text-center font-semibold select-none overflow-hidden text-ellipsis text-slate-100"
                    style={getColumnStyle(col.key, col.name)}
                    title={col.name}
                  >
                    {col.name}
                  </th>
                ))}

                {!readOnly && <th className="sticky top-0 z-30 bg-slate-900 p-1 text-center" style={{ width: '48px', minWidth: '48px' }} />}
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
                    className={`border-b border-slate-200 transition-colors hover:bg-slate-50/90 ${isDragOver ? 'border-t-2 border-blue-500 bg-blue-50' : ''
                      }`}
                  >
                    {!readOnly && (
                      <td
                        draggable
                        onDragStart={(event) => handleDragStart(index, event)}
                        className="cursor-grab select-none border-r border-slate-200 p-0.5 text-center align-middle text-slate-400 hover:text-slate-700 active:cursor-grabbing"
                        title="Drag handle cell to move whole row"
                      >
                        <HiBars3 className="mx-auto h-4 w-4 pointer-events-none" />
                      </td>
                    )}

                    {spanInfo ? (
                      <td
                        rowSpan={spanInfo.count}
                        className="select-none border-b border-r border-slate-300 bg-slate-50/90 p-0.5 sm:p-1 text-center align-middle font-mono font-semibold text-slate-800 text-[11px]"
                      >
                        {spanInfo.startStr}
                      </td>
                    ) : null}

                    {!isBlockEditing ? (
                      spanInfo ? (
                        <td
                          rowSpan={spanInfo.count}
                          onClick={() => {
                            if (readOnly) return;
                            // Seed from `processedRows`, not raw `items` — the two arrays
                            // don't share indices once hidden "Roster: ..." rows and
                            // reordering are in play (see handleCommitDurationDrafts).
                            const drafts: { [id: string]: string } = {};
                            for (let i = parentBlockIndex; i < parentBlockIndex + spanInfo.count; i++) {
                              const row = processedRows[i];
                              if (row) drafts[String(row.id)] = formatDurationToHMS(Number(row.duration) || 0);
                            }
                            setDurationDrafts(drafts);
                            setEditingDurationBlockIndex(parentBlockIndex);
                          }}
                          className={`select-none border-b border-r border-slate-300 bg-slate-50/90 p-0.5 sm:p-1 text-center align-middle font-mono font-semibold text-slate-800 text-[11px] ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/60'
                            }`}
                          title={readOnly ? 'Duration' : 'Click to edit duration'}
                        >
                          {spanInfo.formattedDuration || '-'}
                        </td>
                      ) : null
                    ) : (
                      <td className="relative z-10 border-b border-r border-slate-200 bg-slate-100 p-0.5 text-center align-middle overflow-visible">
                        <input
                          type="text"
                          autoFocus={index === parentBlockIndex}
                          onFocus={(event) => {
                            const end = event.currentTarget.value.length;
                            event.currentTarget.setSelectionRange(end, end);
                          }}
                          className="w-full min-w-0 rounded border border-pink-600 bg-white px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-600"
                          value={durationDrafts[String(item.id)] ?? '00:00:00'}
                          onChange={(event) =>
                            setDurationDrafts((previous) => ({ ...previous, [String(item.id)]: event.target.value }))
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

                    <td
                      {...{ [CELL_ATTRIBUTE]: '' }}
                      onMouseDown={(event) => {
                        if (readOnly) return;
                        if (editingCell?.itemId === item.id && editingCell?.key === 'title') return;
                        const target = event.target as HTMLElement;
                        if (target.closest('a') || target.closest('button')) return;
                        event.preventDefault();
                        setEditingCell({ itemId: item.id, key: 'title' });
                      }}
                      className={`border-r border-slate-200 p-0 align-middle h-full cursor-text hover:bg-slate-100/80 transition-colors ${
                        editingCell?.itemId === item.id && editingCell?.key === 'title'
                          ? 'relative z-50 overflow-visible'
                          : 'overflow-hidden'
                      }`}
                      style={{ width: '140px', minWidth: '110px' }}
                    >
                      {renderCellContent(item.id, 'title', currentTitleVal, false, item.songItemId ?? null)}
                    </td>

                    {dynamicAttrCols.map((col) => {
                      const isCellEditing = editingCell?.itemId === item.id && editingCell?.key === col.key;
                      return (
                        <td
                          key={col.id}
                          {...{ [CELL_ATTRIBUTE]: '' }}
                          onMouseDown={(event) => {
                            if (readOnly) return;
                            if (editingCell?.itemId === item.id && editingCell?.key === col.key) return;
                            const target = event.target as HTMLElement;
                            if (target.closest('a') || target.closest('button')) return;
                            event.preventDefault();
                            setEditingCell({ itemId: item.id, key: col.key });
                          }}
                          className={`border-r border-slate-200 p-0 align-middle text-slate-900 h-full cursor-text hover:bg-slate-100/80 transition-colors ${
                            isCellEditing ? 'relative z-50 overflow-visible' : 'overflow-hidden'
                          }`}
                          style={getColumnStyle(col.key, col.name)}
                        >
                          {renderCellContent(item.id, col.key, readRunsheetCellValue(item, col.key), isPersonColumn(col))}
                        </td>
                      );
                    })}

                    {!readOnly && (
                      <td className="p-0.5 text-center align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleInsertRow(index, 'above')}
                            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-blue-600 hover:bg-blue-50"
                            title="Insert Row Above (Excel style)"
                          >
                            <HiPlus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowToDelete(item)}
                            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-rose-600 hover:bg-rose-50"
                            title="Delete Row"
                          >
                            <HiTrash className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {processedRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100/95 text-slate-800 text-[11px] font-semibold">
                <tr>
                  {!readOnly && <td className="p-0.5 border-r border-slate-200 bg-slate-100" />}
                  <td className="border-r border-slate-300 p-1 text-center font-mono font-bold text-slate-900 bg-slate-200/80">
                    {processedRows[processedRows.length - 1]?.calculatedEnd}
                  </td>
                  <td className="border-r border-slate-300 p-1 text-center font-mono font-bold text-slate-700 bg-slate-200/50">
                    {totalDurationFormatted}
                  </td>
                  <td colSpan={1 + dynamicAttrCols.length + (readOnly ? 0 : 1)} className="p-1 px-3 text-left font-medium text-slate-700 bg-slate-100">
                    <span className="font-bold text-slate-900">Service End:</span> {processedRows[processedRows.length - 1]?.calculatedEnd} &bull; <span className="text-slate-600">Total Duration: {totalDurationFormatted}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Card Timeline View for phones and iPads/tablets (when mobileViewMode === 'cards') */}
      {mobileViewMode === 'cards' && (
        <div className="flex flex-col gap-1.5">
          {processedRows.map((item, index) => {
            const currentTitleVal = item.attributeValues?.ACTIVITYTITLE || item.title || '';
            const isMusic = !!musicCellMap[String(item.id)];
            const plainTitle = htmlToPlainText(currentTitleVal) || 'New Segment';

            return (
              <div
                id={`card_item_${item.id}`}
                key={item.id}
                onClick={() => !readOnly && setEditingCardIndex(index)}
                className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs flex flex-col gap-1.5 transition-all active:bg-slate-50 cursor-pointer scroll-mt-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                      {item.calculatedStart}
                    </span>
                    {item.formattedDuration ? (
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        ({item.formattedDuration})
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {isMusic && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSongModalState({
                            isOpen: true,
                            rowId: item.id,
                            initialValue: currentTitleVal,
                            initialSongItemId: item.songItemId ?? null,
                            readOnly,
                          });
                        }}
                        className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                        title="Linked Song (Click to view details)"
                        aria-label="Linked Song"
                      >
                        <HiMusicalNote className="h-3 w-3 text-slate-700" />
                      </button>
                    )}

                    {!readOnly && (
                      <div className="flex items-center overflow-hidden rounded border border-slate-300">
                        <button
                          type="button"
                          onClick={() => handleMoveCard(index, 'up')}
                          disabled={index === 0}
                          title="Move up"
                          className="flex items-center justify-center bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white cursor-pointer"
                        >
                          <HiChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveCard(index, 'down')}
                          disabled={index === processedRows.length - 1}
                          title="Move down"
                          className="flex items-center justify-center border-l border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white cursor-pointer"
                        >
                          <HiChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setEditingCardIndex(index)}
                        className="rounded bg-pink-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-pink-800 cursor-pointer shadow-xs"
                      >
                        Edit Card
                      </button>
                    )}
                  </div>
                </div>

                <h4 className="font-bold text-slate-900 text-xs sm:text-sm break-words whitespace-normal leading-tight my-0.5">{plainTitle}</h4>

                {/* Populated attributes displayed fully with person cells topmost */}
                <div className="flex flex-col gap-1">
                  {sortedAttrCols.map((col) => {
                    const val = readRunsheetCellValue(item, col.key);
                    if (!val) return null;
                    return (
                      <div key={col.id} className="rounded-md bg-slate-50 border border-slate-200 p-1.5 text-xs">
                        <span className="font-extrabold text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">
                          {col.name}
                        </span>
                        <div className="break-words whitespace-normal text-slate-800 text-xs leading-normal">
                          {renderCellContent(item.id, col.key, val, isPersonColumn(col))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Card View Summary Card */}
          {processedRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-100/90 p-2 sm:p-2.5 flex items-center justify-between text-xs text-slate-700">
              <span className="font-bold text-slate-900">Estimated Service End</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {processedRows[processedRows.length - 1]?.calculatedEnd}
                </span>
                <span className="font-mono text-[11px] text-slate-600 font-semibold">
                  ({totalDurationFormatted})
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single Card Focus Edit Screen View (Isolated Card Focus) */}
      {mounted && editingCardIndex !== null && processedRows[editingCardIndex] && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/70 p-3 sm:p-6 flex flex-col items-center justify-center backdrop-blur-xs touch-auto">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 my-auto max-h-[90vh]">
            {/* Header with Save Card Button */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Card #{editingCardIndex + 1}</h3>
                <span className="font-mono text-xs font-semibold text-blue-700">
                  {processedRows[editingCardIndex].calculatedStart} - {processedRows[editingCardIndex].calculatedEnd}
                  {processedRows[editingCardIndex].formattedDuration ? ` (${processedRows[editingCardIndex].formattedDuration})` : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCardIndex(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCard(editingCardIndex)}
                  className="rounded-lg bg-pink-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-pink-800 cursor-pointer shadow-xs touch-manipulation"
                >
                  Save Card
                </button>
              </div>
            </div>

            {/* Form showing all interactive fields to edit for this card */}
            <div className="flex flex-col gap-3.5 text-xs overflow-y-auto pr-1 flex-1">
              {/* Segment Duration */}
              <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <label className="font-bold text-slate-700 text-xs uppercase tracking-wider text-[10px]">
                  Segment Duration (HH:MM:SS)
                </label>
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="text"
                    disabled={readOnly}
                    value={cardDurationDraft}
                    onChange={(e) => setCardDurationDraft(e.target.value)}
                    onBlur={handleCommitCardDurationDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        handleCommitCardDurationDraft();
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="00:05:00"
                    className="w-28 rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-slate-500">hh:mm:ss</span>
                </div>
              </div>

              {/* Activity Title & Music Toggle */}
              <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 text-xs">Activity Title</label>
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = processedRows[editingCardIndex].id;
                      const musicCellId = String(targetId);
                      const turningOff = !!musicCellMap[musicCellId];
                      setMusicCellMap((prev) => ({ ...prev, [musicCellId]: !prev[musicCellId] }));
                      setItems((previous) => {
                        const updated = [...previous];
                        const idx = updated.findIndex((it) => it.id === targetId);
                        if (idx !== -1) {
                          updated[idx] = { ...updated[idx], songItemId: turningOff ? null : 0 };
                        }
                        return updated;
                      });
                      setIsDirty(true);
                    }}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer touch-manipulation ${
                      musicCellMap[String(processedRows[editingCardIndex].id)]
                        ? 'bg-slate-900 text-white font-bold'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <HiMusicalNote className="h-3 w-3" />
                    {musicCellMap[String(processedRows[editingCardIndex].id)] ? 'Music Segment' : 'Mark Music'}
                  </button>
                </div>
                <div className="mt-0.5">
                  {musicCellMap[String(processedRows[editingCardIndex].id)] ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSongModalState({
                          isOpen: true,
                          rowId: processedRows[editingCardIndex].id,
                          initialValue: cardTitleDraft || processedRows[editingCardIndex].attributeValues?.ACTIVITYTITLE || processedRows[editingCardIndex].title || '',
                          initialSongItemId: processedRows[editingCardIndex].songItemId ?? null,
                          readOnly,
                        });
                      }}
                      className="w-full flex items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 hover:border-slate-400 transition-all shadow-2xs cursor-pointer touch-manipulation text-left"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <HiMusicalNote className="h-4 w-4 text-slate-700 shrink-0" />
                        <span className="truncate">
                          {htmlToPlainText(cardTitleDraft || processedRows[editingCardIndex].attributeValues?.ACTIVITYTITLE || processedRows[editingCardIndex].title || '') || 'Click to Select Song & Key...'}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-2xs shrink-0">
                        Select Song ↗
                      </span>
                    </button>
                  ) : (
                    <input
                      type="text"
                      disabled={readOnly}
                      value={cardTitleDraft}
                      onChange={(e) => setCardTitleDraft(e.target.value)}
                      onBlur={handleCommitCardTitleDraft}
                      placeholder="Enter activity title..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-slate-800 focus:ring-2 focus:ring-slate-800 focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* All Dynamic Attribute Fields (Person columns sorted topmost) */}
              {sortedAttrCols.map((col) => {
                const val = readRunsheetCellValue(processedRows[editingCardIndex], col.key);
                const isPerson = isPersonColumn(col);

                return (
                  <div key={col.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <label className="font-bold text-slate-700 text-xs uppercase tracking-wider text-[10px]">{col.name}</label>
                    <div className="mt-0.5">
                      {isPerson ? (
                        <PeopleSearchDropdown
                          initialValue={val}
                          onSelectPerson={(selectedName) =>
                            handleAttrValueChange(processedRows[editingCardIndex].id, col.key, selectedName)
                          }
                          onClose={() => {}}
                        />
                      ) : (
                        <textarea
                          rows={2}
                          disabled={readOnly}
                          value={cardAttrDrafts[col.key] ?? htmlToPlainText(val)}
                          onChange={(e) => setCardAttrDrafts((previous) => ({ ...previous, [col.key]: e.target.value }))}
                          onBlur={() => handleCommitCardAttrDraft(col.key)}
                          placeholder={`Enter ${col.name.toLowerCase()}...`}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-800 focus:ring-2 focus:ring-slate-800 focus:outline-none resize-y min-h-[60px]"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Action Bar */}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleDeleteRow(processedRows[editingCardIndex].id);
                  setEditingCardIndex(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer touch-manipulation"
              >
                <HiTrash className="h-4 w-4 text-rose-600" />
                <span>Delete Segment</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCardIndex(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCard(editingCardIndex)}
                  className="rounded-lg bg-pink-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-pink-800 cursor-pointer shadow-xs touch-manipulation"
                >
                  Save Card
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      <SongDetailModal
        isOpen={songModalState.isOpen}
        initialValue={songModalState.initialValue}
        initialSongItemId={songModalState.initialSongItemId}
        readOnly={songModalState.readOnly}
        onSelectSong={(formattedSong, songItemId) => {
          if (songModalState.rowId != null) {
            handleSelectSong(songModalState.rowId, formattedSong, songItemId);
            if (editingCardIndex !== null && processedRows[editingCardIndex]?.id === songModalState.rowId) {
              setCardTitleDraft(formattedSong);
            }
          }
        }}
        onClose={() => setSongModalState({ isOpen: false })}
      />
    </div>
  );
}
