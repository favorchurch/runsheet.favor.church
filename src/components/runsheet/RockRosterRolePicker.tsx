'use client';

import { useRef, useState } from 'react';
import { HiXMark } from 'react-icons/hi2';
import { rockSyncRosterRole } from '@/server-actions/rockSyncRosterRole';
import { searchRockPeople, type RockPersonSearchResult } from '@/server-actions/searchRockPeople';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

export interface RockRosterPerson {
  personId: number;
  name: string;
}

interface RockRosterRolePickerProps {
  channelName: string;
  roleTitle: string;
  initialPeople: RockRosterPerson[];
  onSaved: (people: RockRosterPerson[]) => void;
  onClose: () => void;
}

/**
 * Picker for the roster roles that write back to Rock.
 *
 * Every name must come from Rock search so it carries a `personId` — a typed
 * name cannot be addressed in Group Scheduler, so free text and the Guest
 * affordance are deliberately absent here.
 */
export function RockRosterRolePicker({
  channelName,
  roleTitle,
  initialPeople,
  onSaved,
  onClose,
}: RockRosterRolePickerProps) {
  const [people, setPeople] = useState<RockRosterPerson[]>(initialPeople);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<RockPersonSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (term: string) => {
    setSearchTerm(term);
    if (timer.current) clearTimeout(timer.current);
    if (term.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => setResults(await searchRockPeople(term)), SEARCH_DEBOUNCE_MS);
  };

  const addPerson = (match: RockPersonSearchResult) => {
    setPeople((prev) =>
      prev.some((p) => p.personId === match.id) ? prev : [...prev, { personId: match.id, name: match.name }],
    );
    setSearchTerm('');
    setResults([]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await rockSyncRosterRole({
      channelName,
      roleTitle,
      personIds: people.map((p) => p.personId),
    });
    setSaving(false);
    if (!res.success) {
      // Fail closed: revert to what Rock had, keep the picker open.
      setPeople(initialPeople);
      setError(res.error || 'Rock rejected the roster change. Nothing was saved.');
      return;
    }
    onSaved(res.people);
    onClose();
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
      <div className="flex flex-wrap gap-1">
        {people.map((person) => (
          <span
            key={person.personId}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-900"
          >
            {person.name}
            <button
              type="button"
              aria-label={`Remove ${person.name}`}
              onClick={() => setPeople((prev) => prev.filter((p) => p.personId !== person.personId))}
              className="text-slate-500 hover:text-slate-900"
            >
              <HiXMark className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <input
        value={searchTerm}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search Rock for a person"
        aria-label="Search Rock for a person"
        className="mt-1.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]"
      />

      {results.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded border border-slate-200">
          {results.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => addPerson(match)}
                className="block w-full px-1.5 py-1 text-left text-[11px] hover:bg-slate-100"
              >
                {match.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-[10px] font-semibold text-red-700">{error}</p>}

      <div className="mt-1.5 flex justify-end gap-1">
        <button type="button" onClick={onClose} className="px-2 py-1 text-[11px] font-semibold text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save to Rock'}
        </button>
      </div>
    </div>
  );
}
