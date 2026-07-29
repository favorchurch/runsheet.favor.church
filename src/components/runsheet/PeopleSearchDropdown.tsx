'use client';

import { useEffect, useRef, useState } from 'react';
import { searchRockPeople, type RockPersonSearchResult } from '@/server-actions/searchRockPeople';
import { CELL_ATTRIBUTE, FORMAT_BAR_ATTRIBUTE } from './RichTextCell';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

interface PeopleSearchDropdownProps {
  /** Current cell value, used to seed the box so an edit does not start blank. */
  initialValue: string;
  /** Called as the value changes, so the grid always holds the latest text. */
  onSelectPerson: (personName: string) => void;
  onClose: () => void;
}

/**
 * Person picker for Rock Person-backed columns.
 *
 * These cells stay a picker rather than a rich-text editor: the value has to
 * remain a resolvable person name (see `resolvePersonName` in
 * rockGetRunsheetDetails), and markup inside it would break that lookup. Free
 * text is still accepted so a name absent from Rock can be typed in.
 *
 * Closing follows the same rules as `RichTextCell` — a document-level mousedown
 * rather than the input's blur, which fires unpredictably as focus moves — and
 * every keystroke is reported upward, so closing never has to race a save.
 */
export function PeopleSearchDropdown({ initialValue, onSelectPerson, onClose }: PeopleSearchDropdownProps) {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const [results, setResults] = useState<RockPersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seeding the box would otherwise fire a search for a name that is already
  // chosen, so results only appear once the value is actually edited.
  const hasEditedRef = useRef(false);

  const onSelectRef = useRef(onSelectPerson);
  const onCloseRef = useRef(onClose);
  onSelectRef.current = onSelectPerson;
  onCloseRef.current = onClose;

  const update = (name: string) => {
    hasEditedRef.current = true;
    setSearchTerm(name);
    onSelectRef.current(name);
  };

  useEffect(() => {
    if (!hasEditedRef.current) return;

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

  // Focused explicitly rather than with `autoFocus`, and the caret put at the
  // end so the seeded name can be extended rather than replaced.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (target.closest(`[${FORMAT_BAR_ATTRIBUTE}]`)) return;
      // Another cell opens itself on this same mousedown; let it take over.
      if (target.closest(`[${CELL_ATTRIBUTE}]`)) return;

      onCloseRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        aria-label="Search Rock for a person"
        className="w-full rounded border border-pink-600 bg-white px-2 py-0.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-600"
        value={searchTerm}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            onClose();
          }
        }}
      />

      {(results.length > 0 || loading) && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 text-xs text-slate-900 shadow-lg">
          {loading && <div className="p-2 italic text-slate-400">Searching...</div>}

          {!loading &&
            results.map((person) => (
              <div
                key={person.id}
                onMouseDown={() => {
                  update(person.name);
                  onClose();
                }}
                className="flex cursor-pointer flex-col rounded px-2 py-1.5 text-left hover:bg-pink-50 hover:text-pink-900"
              >
                <span className="font-semibold text-slate-800">{person.name}</span>
                {person.email && <span className="text-[10px] text-slate-400">{person.email}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
