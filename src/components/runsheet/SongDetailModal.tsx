'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { rockSearchSongs, SongOption } from '@/server-actions/rockSearchSongs';
import { rockGetSongDetails } from '@/server-actions/rockGetSongDetails';
import { formatMusicalKey, parseSongAndKey, MUSIC_CELL_PLACEHOLDER_TITLE } from './SongSearchDropdown';
import { SongDetails } from '@/types/Song';
import {
  HiMusicalNote,
  HiMagnifyingGlass,
  HiCheck,
  HiXMark,
  HiArrowTopRightOnSquare,
  HiDocumentArrowDown,
  HiInformationCircle,
} from 'react-icons/hi2';

const MUSICAL_KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

interface SongDetailModalProps {
  isOpen: boolean;
  initialValue?: string;
  initialSongItemId?: number | null;
  readOnly?: boolean;
  onSelectSong?: (formattedSong: string, songItemId: number | null) => void;
  onClose: () => void;
}

export function SongDetailModal({
  isOpen,
  initialValue = '',
  initialSongItemId = null,
  readOnly = false,
  onSelectSong,
  onClose,
}: SongDetailModalProps) {
  const parsed = parseSongAndKey(initialValue);
  const isPlaceholderTitle = parsed.songTitle.trim().toLowerCase() === MUSIC_CELL_PLACEHOLDER_TITLE.toLowerCase();
  const initialQueryValue = isPlaceholderTitle ? '' : parsed.songTitle;

  const [query, setQuery] = useState(initialQueryValue);
  const [selectedSongTitle, setSelectedSongTitle] = useState(initialQueryValue);
  const [selectedSongId, setSelectedSongId] = useState<number | null>(initialSongItemId);
  const [selectedKey, setSelectedKey] = useState(isPlaceholderTitle ? '' : parsed.key);
  const [songs, setSongs] = useState<SongOption[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [songDetails, setSongDetails] = useState<SongDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'lyrics'>('details');

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Load details for initial song on open
  const loadSongDetails = useCallback(async (id?: number | null, title?: string) => {
    if (!id && (!title || title.trim().toLowerCase() === MUSIC_CELL_PLACEHOLDER_TITLE.toLowerCase())) {
      setSongDetails(null);
      return;
    }

    setLoadingDetails(true);
    try {
      const res = await rockGetSongDetails({ songId: id, title: title || undefined });
      if (res.success && res.song) {
        setSongDetails(res.song);
        if (res.song.key && !selectedKey) {
          setSelectedKey(res.song.key);
        }
      } else {
        setSongDetails(null);
      }
    } catch (err) {
      console.error('Failed to load song details:', err);
      setSongDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    if (isOpen) {
      loadSongDetails(initialSongItemId, initialQueryValue);
    }
  }, [isOpen, initialSongItemId, initialQueryValue, loadSongDetails]);

  // Debounced search for songs list
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await rockSearchSongs(query);
        if (res.success && res.songs) {
          setSongs(res.songs);
        }
      } catch (err) {
        console.error('Failed to search songs:', err);
      } finally {
        setLoadingSearch(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePickSong = (song: SongOption) => {
    setSelectedSongTitle(song.cleanTitle);
    setSelectedSongId(song.id);
    loadSongDetails(song.id, song.cleanTitle);
  };

  const handleConfirm = () => {
    if (!onSelectSong) {
      onClose();
      return;
    }

    if (!selectedSongId) {
      onSelectSong(MUSIC_CELL_PLACEHOLDER_TITLE, null);
      onClose();
      return;
    }

    const finalSong = selectedSongTitle.trim() || query.trim();
    const formattedKey = formatMusicalKey(selectedKey);
    const formatted = formattedKey
      ? `${finalSong} (${formattedKey})`
      : finalSong;

    onSelectSong(formatted, selectedSongId);
    onClose();
  };

  const formattedKeyPreview = formatMusicalKey(selectedKey);
  const finalSongPreview = selectedSongTitle.trim() || query.trim();
  const computedPreview = selectedSongId
    ? `${finalSongPreview}${formattedKeyPreview ? ` (${formattedKeyPreview})` : ''}`
    : MUSIC_CELL_PLACEHOLDER_TITLE;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div
        ref={modalRef}
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white font-bold shadow-xs">
              <HiMusicalNote className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {readOnly ? 'Song Details' : 'Select Song & Key'}
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Favor Church Song Library (Rock RMS Content Channel 18)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {songDetails?.rockUrl && (
              <a
                href={songDetails.rockUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
              >
                <span>Edit in Rock</span>
                <HiArrowTopRightOnSquare className="h-3.5 w-3.5 text-slate-500" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <HiXMark className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Pane Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-0 flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Left Pane: Search & Song Picker */}
          <div className="md:col-span-5 flex flex-col p-4 bg-slate-50/40 min-h-0 overflow-hidden">
            {/* Search Input */}
            <div className="relative mb-3">
              <HiMagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedSongTitle(e.target.value);
                  setSelectedSongId(null);
                }}
                placeholder="Search Rock songs..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 shadow-2xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSelectedSongTitle('');
                    setSelectedSongId(null);
                    setSongDetails(null);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <HiXMark className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Song Results List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-[140px] md:min-h-0">
              {loadingSearch ? (
                <div className="flex items-center justify-center py-8 text-xs font-medium text-slate-400">
                  <span className="inline-block animate-spin mr-2">⏳</span> Searching Rock songs...
                </div>
              ) : songs.length > 0 ? (
                songs.map((song) => {
                  const isSelected =
                    selectedSongId === song.id ||
                    selectedSongTitle.toLowerCase() === song.cleanTitle.toLowerCase();

                  return (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => handlePickSong(song)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-slate-900 text-white font-semibold shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200/60 hover:bg-slate-100/80 hover:border-slate-300'
                      }`}
                    >
                      <span className="truncate pr-2">{song.cleanTitle}</span>
                      {isSelected && <HiCheck className="h-4 w-4 shrink-0 text-white" />}
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center px-4">
                  <p className="text-xs font-medium text-slate-500">
                    {query.trim()
                      ? `No songs found matching "${query}"`
                      : 'Type above to search Rock RMS songs'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Rich Song Details View */}
          <div className="md:col-span-7 flex flex-col min-h-0 overflow-hidden bg-white p-4 sm:p-6">
            {loadingDetails ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs font-medium text-slate-400 space-y-2">
                <span className="inline-block animate-spin text-2xl">⏳</span>
                <span>Loading song details...</span>
              </div>
            ) : songDetails ? (
              <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                {/* Song Header & Rock Link */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                      {songDetails.cleanTitle}
                    </h3>
                    {songDetails.artist && (
                      <p className="text-xs font-semibold text-slate-600 mt-0.5">
                        🎤 {songDetails.artist}
                      </p>
                    )}
                  </div>
                  <a
                    href={songDetails.rockUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                  >
                    <span>Rock RMS</span>
                    <HiArrowTopRightOnSquare className="h-3 w-3" />
                  </a>
                </div>

                {/* Metadata Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {songDetails.key && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-[11px] font-bold text-indigo-900">
                      🎹 Default: {songDetails.key}
                    </span>
                  )}
                  {(songDetails.bpm || songDetails.timeSignature) && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                      ⏱️ {songDetails.bpm ? `${songDetails.bpm} BPM` : ''}
                      {songDetails.bpm && songDetails.timeSignature ? ' • ' : ''}
                      {songDetails.timeSignature || ''}
                    </span>
                  )}
                  {songDetails.ccli && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      📄 CCLI: {songDetails.ccli}
                    </span>
                  )}
                  {songDetails.themes && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      🏷️ {songDetails.themes}
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'details'
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Resources & Charts ({songDetails.sheetMusicLinks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lyrics')}
                    className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'lyrics'
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Lyrics & Sections ({songDetails.sections.length})
                  </button>
                </div>

                {/* Tab 1: Sheet Music & Chord Charts */}
                {activeTab === 'details' && (
                  <div className="space-y-3">
                    {songDetails.sheetMusicLinks.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {songDetails.sheetMusicLinks.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs font-bold text-indigo-950 hover:bg-indigo-100/70 hover:border-indigo-300 transition-all shadow-2xs group"
                          >
                            <span className="flex items-center gap-2 truncate pr-2">
                              <HiDocumentArrowDown className="h-4 w-4 text-indigo-600 shrink-0" />
                              <span className="truncate">{link.label}</span>
                            </span>
                            <HiArrowTopRightOnSquare className="h-3.5 w-3.5 text-indigo-400 group-hover:text-indigo-700 shrink-0" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
                        <p className="text-xs text-slate-500">
                          No chord charts or attachments found in Rock RMS.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Lyrics & Sections */}
                {activeTab === 'lyrics' && (
                  <div className="space-y-3">
                    {songDetails.sections.length > 0 ? (
                      songDetails.sections.map((section, idx) => (
                        <div
                          key={idx}
                          className={`rounded-xl p-3.5 text-xs ${
                            section.isChorus
                              ? 'bg-indigo-50/70 border-l-4 border-indigo-600 text-slate-900'
                              : 'bg-slate-50/80 border border-slate-200 text-slate-800'
                          }`}
                        >
                          <h4
                            className={`text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                              section.isChorus ? 'text-indigo-900' : 'text-slate-500'
                            }`}
                          >
                            {section.title}
                          </h4>
                          <div className="whitespace-pre-line leading-relaxed font-medium">
                            {section.content}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
                        <p className="text-xs text-slate-500">No lyrics text available for this song.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                  <HiMusicalNote className="h-5 w-5" />
                </div>
                <div className="max-w-xs">
                  <h4 className="text-xs font-bold text-slate-800">No Song Selected</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Select a song from the search results on the left to inspect its key, BPM, chord charts, and lyrics.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer: Key Picker, Runsheet Preview & Actions */}
        <div className="border-t border-slate-200 bg-slate-50/90 px-5 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Key Picker (Only in edit mode) */}
          {!readOnly && (
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mr-1">
                Key:
              </span>
              <div className="flex flex-wrap gap-1">
                {MUSICAL_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKey(selectedKey === k ? '' : k)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
                      selectedKey === k
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {selectedKey && (
                <button
                  type="button"
                  onClick={() => setSelectedKey('')}
                  className="text-[10px] text-slate-400 hover:text-rose-600 font-semibold cursor-pointer ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 shrink-0">
            {!readOnly && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-600">
                <HiInformationCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate max-w-[160px]">Preview: <strong className="text-slate-900">{computedPreview}</strong></span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-black cursor-pointer shadow-xs transition-colors"
              >
                Apply to Runsheet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
