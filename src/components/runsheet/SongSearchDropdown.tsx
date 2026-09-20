'use client';

import React, { useEffect, useState, useRef } from 'react';
import { rockSearchSongs, SongOption } from '@/server-actions/rockSearchSongs';
import { cleanSongTitle } from '@/lib/songUtils';
import { HiMagnifyingGlass, HiMusicalNote, HiCheck, HiXMark, HiArrowTopRightOnSquare } from 'react-icons/hi2';

const MUSICAL_KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

interface SongSearchDropdownProps {
  initialValue: string;
  /** Rock ContentChannelItem.Id of the song currently linked to this cell, if any. */
  initialSongItemId?: number | null;
  onSelectSong: (formattedSong: string, songItemId: number | null) => void;
  onOpenFullModal?: () => void;
  onClose: () => void;
}

export function formatMusicalKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (!trimmed) return '';

  const m = trimmed.match(/^([a-g])([b#]?)(.*)$/i);
  if (m) {
    const note = m[1].toUpperCase();
    const acc = m[2] ? (m[2].toLowerCase() === 'b' ? 'b' : m[2]) : '';
    const rest = m[3] || '';
    return `${note}${acc}${rest}`;
  }

  return trimmed;
}

export function parseSongAndKey(val: string): { songTitle: string; key: string } {
  if (!val) return { songTitle: '', key: '' };
  
  const cleanVal = val.replace(/<[^>]*>/g, '').trim();
  const m = cleanVal.match(/^(.*?)(?:\s*\(([A-G][b#]?[m]?|[A-G][b#]?[m]?\/[A-G][b#]?)\))?$/i);
  if (m && m[2]) {
    return {
      songTitle: cleanSongTitle(m[1]),
      key: formatMusicalKey(m[2]),
    };
  }

  return {
    songTitle: cleanSongTitle(cleanVal),
    key: '',
  };
}

/** The fallback text a music cell saves as when no real song is linked. */
export const MUSIC_CELL_PLACEHOLDER_TITLE = 'New Segment';

export function SongSearchDropdown({
  initialValue,
  initialSongItemId = null,
  onSelectSong,
  onOpenFullModal,
  onClose,
}: SongSearchDropdownProps) {
  const parsed = parseSongAndKey(initialValue);
  // The placeholder text isn't a real search term — starting the box on it
  // would just search Rock for songs named "New Segment".
  const isPlaceholderTitle = parsed.songTitle.trim().toLowerCase() === MUSIC_CELL_PLACEHOLDER_TITLE.toLowerCase();
  const initialQueryValue = isPlaceholderTitle ? '' : parsed.songTitle;

  const [query, setQuery] = useState(initialQueryValue);
  const [selectedSongTitle, setSelectedSongTitle] = useState(initialQueryValue);
  const [selectedSongId, setSelectedSongId] = useState<number | null>(initialSongItemId);
  const [selectedKey, setSelectedKey] = useState(isPlaceholderTitle ? '' : parsed.key);
  const [songs, setSongs] = useState<SongOption[]>([]);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Search Rock RMS songs with debouncing
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await rockSearchSongs(query);
      if (res.success && res.songs) {
        setSongs(res.songs);
      }
      setLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handlePickSong = (song: SongOption) => {
    setSelectedSongTitle(song.cleanTitle);
    setQuery(song.cleanTitle);
    setSelectedSongId(song.id);
  };

  // Music cells only ever hold a real linked Rock song or the placeholder —
  // free-typed text that doesn't match a real song is never saveable here,
  // same as this cell's toggle button can't be turned on without a value.
  const handleConfirm = () => {
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
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-1 w-80 rounded-xl border border-slate-300 bg-white p-3 shadow-2xl ring-1 ring-black/5"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <HiMusicalNote className="h-4 w-4 text-slate-700" />
          <span>Select Song & Key</span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenFullModal && (
            <button
              type="button"
              onClick={onOpenFullModal}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              title="Open full song details modal"
            >
              <span>Details</span>
              <HiArrowTopRightOnSquare className="h-3 w-3 text-slate-500" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-2">
        <HiMagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedSongTitle(e.target.value);
            setSelectedSongId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Search songs in Rock..."
          className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs font-medium text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
        />
      </div>

      {/* Songs Dropdown List */}
      <div className="max-h-40 overflow-y-auto mb-3 space-y-0.5 rounded-lg border border-slate-100 bg-slate-50/50 p-1">
        {loading ? (
          <div className="py-3 text-center text-xs font-medium text-slate-400">Searching Rock Songs...</div>
        ) : songs.length > 0 ? (
          songs.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => handlePickSong(song)}
              className={`w-full rounded px-2 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                selectedSongTitle.toLowerCase() === song.cleanTitle.toLowerCase()
                  ? 'bg-slate-200 text-slate-950 font-bold'
                  : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <span>{song.cleanTitle}</span>
              {selectedSongTitle.toLowerCase() === song.cleanTitle.toLowerCase() && (
                <HiCheck className="h-3.5 w-3.5 text-slate-900" />
              )}
            </button>
          ))
        ) : (
          <div className="py-3 text-center text-xs font-medium text-slate-400">
            {query.trim()
              ? `No matching songs in Rock — pick one above, or Apply to save as "${MUSIC_CELL_PLACEHOLDER_TITLE}"`
              : 'Type to search songs'}
          </div>
        )}
      </div>

      {/* Musical Key Picker */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Song Key (Optional)
          </label>
          {selectedKey && (
            <button
              type="button"
              onClick={() => setSelectedKey('')}
              className="text-[10px] text-slate-500 hover:text-rose-600 font-medium cursor-pointer"
            >
              Clear Key
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {MUSICAL_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedKey(selectedKey === k ? '' : k)}
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                selectedKey === k
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview & Apply Button */}
      <div
        className={`mb-3 rounded-lg border p-2 text-center ${
          selectedSongId ? 'border-slate-300 bg-slate-100/90' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <span
          className={`block text-[10px] font-bold uppercase tracking-wider ${
            selectedSongId ? 'text-slate-800' : 'text-slate-500'
          }`}
        >
          {selectedSongId ? 'Preview' : 'No song selected — will save as'}
        </span>
        <span className={`text-xs font-bold ${selectedSongId ? 'text-slate-950' : 'text-slate-600'}`}>
          {computedPreview}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black cursor-pointer shadow-xs"
        >
          Apply Song
        </button>
      </div>
    </div>
  );
}
