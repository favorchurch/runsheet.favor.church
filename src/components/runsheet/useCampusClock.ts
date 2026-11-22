'use client';

import { useEffect, useState } from 'react';
import { getRunsheetDateKey, getRunsheetTimeZone, readCampusClock, type CampusClock } from '@/lib/runsheetLiveProgress';

const TICK_MS = 20_000;

/**
 * The campus wall clock for a runsheet, refreshed every 20 seconds and
 * floored to the minute, or null when the runsheet is not dated today in its
 * campus time zone. Null and an unchanged minute both leave the state equal,
 * so the editor re-renders at most once a minute and only on service day.
 */
export function useCampusClock(channelName: string): CampusClock | null {
  const [clockKey, setClockKey] = useState<string | null>(null);

  useEffect(() => {
    const dateKey = getRunsheetDateKey(channelName);
    if (!dateKey) {
      setClockKey(null);
      return;
    }
    const timeZone = getRunsheetTimeZone(channelName);

    const tick = () => {
      const clock = readCampusClock(new Date(), timeZone);
      setClockKey(clock.dateKey === dateKey ? `${clock.dateKey}|${Math.floor(clock.minutes)}` : null);
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [channelName]);

  if (!clockKey) return null;
  const [dateKey, minutes] = clockKey.split('|');
  return { dateKey, minutes: Number(minutes) };
}
