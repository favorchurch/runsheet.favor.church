'use client';

import React, { useEffect, useState } from 'react';
import { getRockContentChannelOptions, ContentChannelTypeOption, ContentChannelCategoryOption } from '@/server-actions/getRockContentChannelOptions';
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
  const [types, setTypes] = useState<ContentChannelTypeOption[]>([]);
  const [categories, setCategories] = useState<ContentChannelCategoryOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [selectedTypeId, setSelectedTypeId] = useState<number | ''>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [serviceTypePrefix, setServiceTypePrefix] = useState('Sunday Service Runsheet');
  const [date, setDate] = useState(getNextSunday());
  const [session, setSession] = useState('AM');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      const res = await getRockContentChannelOptions();
      if (res.success) {
        setTypes(res.types);
        setCategories(res.categories);

        const defaultType = res.types.find((t) => t.name.toLowerCase().includes('runsheet'));
        if (defaultType) {
          setSelectedTypeId(defaultType.id);
        } else if (res.types.length > 0) {
          setSelectedTypeId(res.types[0].id);
        }

        if (res.categories.length > 0) {
          setSelectedCategoryId(res.categories[0].id);
        }
      }
      setLoadingOptions(false);
    }

    loadOptions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTypeId) {
      setStatus({ type: 'error', message: 'Please select a Content Channel Type.' });
      return;
    }

    setStatus({ type: 'loading' });

    const formattedDate = formatDateToWordy(date);
    const title = `${serviceTypePrefix} // ${formattedDate} // ${session}`;

    const res = await rockCreateServiceRunsheet(
      title,
      Number(selectedTypeId),
      selectedCategoryId ? Number(selectedCategoryId) : undefined
    );

    if (res.success && res.id) {
      setStatus({
        type: 'success',
        message: `Successfully created Content Channel "${title}" (ID: ${res.id}) in Rock RMS!`,
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
      <h2 className="mb-4 text-xl font-bold text-slate-900">Create Content Channel Details</h2>

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
              Content Channel Type
            </label>
            <select
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select a Channel Type...</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} (ID: {type.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Category
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">(None)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} (ID: {cat.id})
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
              Session
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-600 focus:outline-none"
              value={session}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
              <option value="All Day">All Day</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={status.type === 'loading'}
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {status.type === 'loading' ? 'Creating in Rock...' : 'Create Content Channel in Rock'}
          </button>
        </form>
      )}
    </div>
  );
}
