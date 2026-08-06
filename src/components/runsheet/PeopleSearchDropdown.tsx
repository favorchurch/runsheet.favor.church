'use client';

import { useEffect, useRef, useState } from 'react';
import { searchRockPeople, type RockPersonSearchResult } from '@/server-actions/searchRockPeople';
import { CELL_ATTRIBUTE, FORMAT_BAR_ATTRIBUTE } from './RichTextCell';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

export interface PersonItem {
  id: string;
  name: string;
  isGuest: boolean;
}

export function parsePeopleString(str: string): PersonItem[] {
  if (!str || !str.trim()) return [];
  const parts = str.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  return parts.map((part, index) => {
    const isGuest = /\(guest\)$/i.test(part);
    const cleanName = part.replace(/\s*\(guest\)$/i, '').trim();
    return {
      id: `p_${index}_${cleanName.replace(/\s+/g, '_')}`,
      name: cleanName,
      isGuest,
    };
  });
}

export function formatPeopleArray(items: PersonItem[]): string {
  return items
    .map((item) => (item.isGuest ? `${item.name} (Guest)` : item.name))
    .join(', ');
}

interface PeopleSearchDropdownProps {
  /** Current cell value, used to seed the box so an edit does not start blank. */
  initialValue: string;
  /** Called as the value changes, so the grid always holds the latest text. */
  onSelectPerson: (personName: string) => void;
  onClose: () => void;
}

/**
 * Person & Guest picker for Rock Person-backed columns.
 *
 * Supports multiple selected people per cell, toggleable Guest badges/status,
 * strict validation before committing, and searching Rock RMS.
 */
export function PeopleSearchDropdown({ initialValue, onSelectPerson, onClose }: PeopleSearchDropdownProps) {
  const [selectedPeople, setSelectedPeople] = useState<PersonItem[]>(() => parsePeopleString(initialValue));
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<RockPersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelectRef = useRef(onSelectPerson);
  const onCloseRef = useRef(onClose);
  onSelectRef.current = onSelectPerson;
  onCloseRef.current = onClose;

  const notifyChange = (updatedPeople: PersonItem[]) => {
    setSelectedPeople(updatedPeople);
    onSelectRef.current(formatPeopleArray(updatedPeople));
  };

  const addPerson = (name: string, isGuest = false) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = selectedPeople.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setSearchTerm('');
      setResults([]);
      return;
    }
    const updated = [
      ...selectedPeople,
      { id: `p_${Date.now()}_${Math.random()}`, name: trimmed, isGuest },
    ];
    notifyChange(updated);
    setSearchTerm('');
    setResults([]);
  };

  const removePerson = (index: number) => {
    const updated = selectedPeople.filter((_, i) => i !== index);
    notifyChange(updated);
  };

  const toggleGuest = (index: number) => {
    const updated = selectedPeople.map((person, i) =>
      i === index ? { ...person, isGuest: !person.isGuest } : person
    );
    notifyChange(updated);
  };

  useEffect(() => {
    if (searchTerm.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const matches = await searchRockPeople(searchTerm);
      if (cancelled) return;
      setResults(matches);
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (target.closest(`[${FORMAT_BAR_ATTRIBUTE}]`)) return;
      if (target.closest(`[${CELL_ATTRIBUTE}]`)) return;

      onCloseRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const query = searchTerm.trim();

      // Requirement 2: If user typed something in search box, do NOT commit unselected text unless selected or added
      if (query.length > 0) {
        if (results.length > 0) {
          // Add top Rock search match
          addPerson(results[0].name, false);
        } else {
          // Add as custom person if no search results match
          addPerson(query, false);
        }
      } else {
        // Search box is empty -> commit selected people and close editor
        onClose();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full rounded-lg border border-pink-600 bg-white p-2 shadow-xl">
      {/* Selected People Chips */}
      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {selectedPeople.map((person, idx) => (
            <span
              key={person.id || idx}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all ${
                person.isGuest
                  ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                  : 'bg-slate-100 text-slate-800 border-slate-300'
              }`}
            >
              <span>{person.name}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleGuest(idx);
                }}
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                  person.isGuest
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-slate-200 text-slate-700 hover:bg-amber-200 hover:text-amber-900'
                }`}
                title={person.isGuest ? 'Guest (Click to toggle off)' : 'Mark as Guest'}
              >
                {person.isGuest ? 'Guest ✓' : '+ Guest'}
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removePerson(idx);
                }}
                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 cursor-pointer text-xs"
                title="Remove person"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search Input Box */}
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          aria-label="Search Rock for a person or add guest"
          placeholder={selectedPeople.length > 0 ? '+ Add another person or guest...' : 'Search Rock or type name...'}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-pink-600 focus:outline-none focus:ring-1 focus:ring-pink-600"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {searchTerm.trim().length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              addPerson(searchTerm, true);
            }}
            className="shrink-0 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-2.5 py-1 cursor-pointer transition-colors shadow-xs"
            title="Add typed name as Guest"
          >
            + Guest
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {(results.length > 0 || loading || searchTerm.trim().length > 0) && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 text-xs text-slate-900 shadow-xl">
          {loading && <div className="p-2 italic text-slate-400">Searching Rock RMS...</div>}

          {!loading &&
            results.map((person) => (
              <div
                key={person.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addPerson(person.name, false);
                }}
                className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left hover:bg-pink-50 hover:text-pink-900 transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">{person.name}</span>
                  {person.email && <span className="text-[10px] text-slate-400">{person.email}</span>}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addPerson(person.name, true);
                  }}
                  className="rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-[10px] px-1.5 py-0.5 cursor-pointer"
                  title="Add as Guest"
                >
                  + Guest
                </button>
              </div>
            ))}

          {!loading && searchTerm.trim().length > 0 && (
            <div className="border-t border-slate-100 mt-1 pt-1 flex flex-col gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addPerson(searchTerm, false);
                }}
                className="w-full text-left font-semibold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
              >
                + Add &quot;{searchTerm.trim()}&quot;
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addPerson(searchTerm, true);
                }}
                className="w-full text-left font-semibold text-amber-800 hover:bg-amber-50 px-2 py-1 rounded flex items-center justify-between transition-colors"
              >
                <span>+ Add &quot;{searchTerm.trim()}&quot; as Guest</span>
                <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded">Guest</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
