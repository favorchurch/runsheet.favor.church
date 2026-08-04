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

interface CreateRunsheetFormProps {
  onCreated?: (channelId: number, title: string) => void;
}

export function CreateRunsheetForm({ onCreated }: CreateRunsheetFormProps) {
  const [categories, setCategories] = useState<ContentChannelCategoryOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const [selectedTypeId, setSelectedTypeId] = useState<number>(13);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [serviceTypePrefix, setServiceTypePrefix] = useState('Sunday Service Runsheet');
  const [date, setDate] = useState(getNextSunday());
  const [session, setSession] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
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
      }
      setLoadingOptions(false);
    }

    loadOptions();
  }, []);

  useEffect(() => {
    async function loadSchedules() {
      if (!selectedCategoryId) return;
      setLoadingSchedules(true);
      const res = await rockGetScheduleOptions(Number(selectedCategoryId), date);
      if (res.success && res.schedules) {
        setSchedules(res.schedules);
        if (res.schedules.length > 0) {
          setSession(res.schedules[0].name);
        } else {
          setSession('AM');
        }
      }
      setLoadingSchedules(false);
    }

    loadSchedules();
  }, [selectedCategoryId, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      setStatus({ type: 'error', message: 'Please select a Category.' });
      return;
    }

    setStatus({ type: 'loading' });

    const formattedDate = formatDateToWordy(date);
    const title = `${serviceTypePrefix} // ${formattedDate} // ${session}`;

    const res = await rockCreateServiceRunsheet(
      title,
      Number(selectedTypeId || 13),
      Number(selectedCategoryId)
    );

    if (res.success && res.id) {
      setStatus({
        type: 'success',
        message: `Successfully created "${title}"!`,
      });

      // Automatically load into editor
      if (onCreated) {
        onCreated(res.id, title);
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
              Runsheet Name Prefix
            </label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={serviceTypePrefix}
              onChange={(e) => setServiceTypePrefix(e.target.value)}
            />
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

          <button
            type="submit"
            disabled={status.type === 'loading'}
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {status.type === 'loading' ? 'Creating in Rock...' : 'Create Runsheet'}
          </button>
        </form>
      )}
    </div>
  );
}
