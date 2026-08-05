'use client';

import React, { useEffect, useState } from 'react';
import { getRockContentChannelOptions, ContentChannelCategoryOption } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions, ScheduleOption } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';

function getNextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().split('T')[0];
}

function formatDateToWordy(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function generateRunsheetTitle(
  sessionName: string,
  dateStr: string,
  timeLabel?: string,
  categoryName?: string
): string {
  const formattedDate = formatDateToWordy(dateStr);
  if (!sessionName) {
    const prefix = categoryName || 'Runsheet';
    const slot = timeLabel || 'AM';
    return `${prefix} // ${formattedDate} // ${slot}`;
  }

  const m = sessionName.match(/^(.*?)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(.*)$/i);
  if (m) {
    const before = m[1].trim();
    const timeSlot = m[2].trim().toUpperCase().replace(/\s+/g, '');
    const after = m[3].trim();
    let prefix = after ? `${before} ${after}`.trim() : before;
    prefix = prefix.replace(/\s+/g, ' ').replace(/^[\s|\-]+|[\s|\-]+$/g, '');

    if (!prefix) {
      prefix = categoryName || 'Runsheet';
    }

    return `${prefix} // ${formattedDate} // ${timeSlot}`;
  }

  const prefix = sessionName.trim() || categoryName || 'Runsheet';
  const slot = (timeLabel || 'AM').trim().toUpperCase().replace(/\s+/g, '');
  return `${prefix} // ${formattedDate} // ${slot}`;
}

import type { RunsheetDetails } from '@/types/Runsheet';

interface CreateRunsheetFormProps {
  onCreated?: (channelId: number, title: string, createdData?: RunsheetDetails) => void;
  onCancel?: () => void;
}

export function CreateRunsheetForm({ onCreated, onCancel }: CreateRunsheetFormProps) {
  const [categories, setCategories] = useState<ContentChannelCategoryOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const [selectedTypeId, setSelectedTypeId] = useState<number>(13);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [date, setDate] = useState(getNextSunday());
  const [session, setSession] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const res = await getRockContentChannelOptions();
        if (res.success) {
          setCategories(res.categories);

          if (res.types.length > 0) {
            setSelectedTypeId(res.types[0].id);
          }

          if (res.categories.length > 0) {
            const initialCatId = res.categories[0].id;
            setSelectedCategoryId(initialCatId);
          }
        } else {
          setStatus({ type: 'error', message: res.error || 'Failed to load options from Rock.' });
        }
      } catch (err: any) {
        console.error('Error loading options in CreateRunsheetForm:', err);
        setStatus({ type: 'error', message: err?.message || 'Failed to load options from Rock.' });
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    async function loadSchedules() {
      if (!selectedCategoryId) return;
      setLoadingSchedules(true);
      try {
        const res = await rockGetScheduleOptions(Number(selectedCategoryId), date);
        if (res.success && res.schedules) {
          setSchedules(res.schedules);
          if (res.schedules.length > 0) {
            setSession(res.schedules[0].name);
          } else {
            setSession('AM');
          }
        }
      } catch (err: any) {
        console.error('Error loading schedules in CreateRunsheetForm:', err);
      } finally {
        setLoadingSchedules(false);
      }
    }

    loadSchedules();
  }, [selectedCategoryId, date]);

  useEffect(() => {
    const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
    const selectedSchedule = schedules.find((s) => s.name === session);
    const autoTitle = generateRunsheetTitle(
      session,
      date,
      selectedSchedule?.timeLabel,
      selectedCategory?.name
    );
    setTitle(autoTitle);
  }, [session, date, selectedCategoryId, categories, schedules]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      setStatus({ type: 'error', message: 'Please select a Category.' });
      return;
    }
    if (!title.trim()) {
      setStatus({ type: 'error', message: 'Please enter a Runsheet Title.' });
      return;
    }

    setStatus({ type: 'loading' });

    const finalTitle = title.trim();

    const res = await rockCreateServiceRunsheet(
      finalTitle,
      Number(selectedTypeId || 13),
      Number(selectedCategoryId)
    );

    if (res.success && res.id) {
      setStatus({
        type: 'success',
        message: `Successfully created "${finalTitle}"!`,
      });

      // Automatically load into editor
      if (onCreated) {
        onCreated(res.id, finalTitle, res.data);
      }
    } else {
      setStatus({ type: 'error', message: res.error || 'Unknown error' });
    }
  };

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Create New Runsheet</h2>

      {status.type === 'success' && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 border border-emerald-200">
          {status.message}
        </div>
      )}

      {status.type === 'error' && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm font-semibold text-rose-800 border border-rose-200">
          {status.message}
        </div>
      )}

      {loadingOptions ? (
        <div className="py-8 text-center text-sm font-medium text-slate-500">
          Loading options from Rock RMS...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Category
            </label>
            <select
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
            >
              {categories.length === 0 && <option value="" disabled>No Categories Available</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Date
            </label>
            <input
              type="date"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Session / Service Schedule
            </label>
            <select
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
              value={session}
              disabled={loadingSchedules}
              onChange={(e) => setSession(e.target.value)}
            >
              {loadingSchedules ? (
                <option value="">Loading schedules...</option>
              ) : schedules.length > 0 ? (
                schedules.map((s) => (
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Runsheet Title
            </label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="mt-1 text-xs font-medium text-red-600">
              Auto-generated from session & date. You can edit this title directly if needed.
            </p>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={status.type === 'loading'}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status.type === 'loading'}
              className="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {status.type === 'loading' ? 'Saving...' : 'Save Runsheet'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
