'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { canUserEditRunsheet } from '@/lib/permissions';
import { canAccessRunsheetChannel } from '@/lib/runsheetCampus';

export interface RunsheetChannelOption {
  id: number;
  name: string;
}

/** Helper to format a Date into multiple matching representations */
function buildDateMatchingTokens(dateStr: string): string[] {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return [];

  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate(); // 1-31

  const monthNamesLong = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthNamesShort = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const monthLong = monthNamesLong[month - 1];
  const monthShort = monthNamesShort[month - 1];

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const longDate = `${monthLong} ${day}, ${year}`;
  const shortMonthDate = `${monthShort} ${day}, ${year}`;
  const mdySlash = `${month}/${day}/${year}`;
  const mdySlashShortYear = `${month}/${day}/${String(year).slice(-2)}`;
  const mdSlash = `${month}/${day}`;

  return [
    iso.toLowerCase(),
    longDate.toLowerCase(),
    shortMonthDate.toLowerCase(),
    mdySlash.toLowerCase(),
    mdySlashShortYear.toLowerCase(),
    mdSlash.toLowerCase(),
  ];
}

function extractChannelDate(name: string): Date | null {
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const m1 = name.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m1) {
    const month = months[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    return new Date(year, month, day);
  }

  const m2 = name.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    const month = parseInt(m2[1], 10) - 1;
    const day = parseInt(m2[2], 10);
    const year = parseInt(m2[3], 10);
    return new Date(year, month, day);
  }

  const m3 = name.match(/(\d{1,2})\/(\d{1,2})/);
  if (m3) {
    const currentYear = new Date().getFullYear();
    const month = parseInt(m3[1], 10) - 1;
    const day = parseInt(m3[2], 10);
    return new Date(currentYear, month, day);
  }

  const m4 = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m4) {
    const year = parseInt(m4[1], 10);
    const month = parseInt(m4[2], 10) - 1;
    const day = parseInt(m4[3], 10);
    return new Date(year, month, day);
  }

  return null;
}

function getTimezoneForChannelName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('BNE') || upper.includes('BRISBANE')) {
    return 'Australia/Brisbane';
  }
  if (upper.includes('SEL') || upper.includes('SEOUL')) {
    return 'Asia/Seoul';
  }
  if (upper.includes('MNL') || upper.includes('MANILA')) {
    return 'Asia/Manila';
  }
  return 'Asia/Manila';
}

function getTodayInTimezone(timeZone = 'Asia/Manila'): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '1970', 10);

  return new Date(year, month, day, 0, 0, 0, 0);
}

function isChannelPast(name: string): boolean {
  const dt = extractChannelDate(name);
  if (!dt) return false;

  const tz = getTimezoneForChannelName(name);
  const today = getTodayInTimezone(tz);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime() < today.getTime();
}

export async function rockGetAvailableRunsheetChannels(includeArchived = false): Promise<{
  success: boolean;
  channels: RunsheetChannelOption[];
  error?: string;
}> {
  try {
    // Require active Rock session
    const session = await getRockSession();
    const canEdit = canUserEditRunsheet(session);

    // Fetch Content Channels from Rock RMS for ContentChannelTypeId 13 ("Service Runsheet")
    const channels = (await rockGet('/ContentChannels', {
      $filter: 'ContentChannelTypeId eq 13',
      $select: 'Id,Name,ContentChannelTypeId',
      $orderby: 'Id desc',
      $top: 200,
    })) as Array<{ Id: number; Name: string }> | null;

    let available = channels || [];

    // Editors can bypass past filtering if includeArchived is true.
    // View-only users (!canEdit) are NEVER allowed to view past/finished runsheets.
    const allowArchived = canEdit && includeArchived;
    if (!allowArchived) {
      available = available.filter((c) => !isChannelPast(c.Name));
    }

    // Campus isolation applies to everyone (editors and viewers alike) —
    // only Global Staff / Rock Administration (runsheetCampuses: ['ALL'])
    // bypass it. See rockResolveAccess for how a user's scope is derived.
    available = available.filter((c) => canAccessRunsheetChannel(session?.access?.runsheetCampuses, c.Name));

    // If user is VIEW-only (not an editor / not Rock Admin), filter to only runsheets they are rostered in
    if (!canEdit && session) {
      const aliasId = session.contact?.primaryAliasId || session.contact?.id;
      const personId = session.contact?.id;

      // Map of ISO date string -> Set of rostered time tokens for that date (e.g. '10:00 am', '10am')
      const rosteredDateMap = new Map<string, Set<string>>();
      const allRosteredDateTokens = new Set<string>();

      if (aliasId || personId) {
        try {
          const filter = aliasId
            ? `PersonAliasId eq ${aliasId}`
            : `PersonId eq ${personId}`;

          const attendances = (await rockGet('/Attendances', {
            $filter: filter,
            $select: 'Id,StartDateTime,DidAttend,RSVP',
            $top: 200,
            $orderby: 'StartDateTime desc',
          })) as Array<{ StartDateTime?: string; RSVP?: number }> | null;

          if (attendances && attendances.length > 0) {
            for (const att of attendances) {
              if (att.StartDateTime) {
                const dateTokens = buildDateMatchingTokens(att.StartDateTime);
                for (const tok of dateTokens) {
                  allRosteredDateTokens.add(tok);
                }

                // Extract time tokens for this specific date
                const dt = new Date(att.StartDateTime);
                if (!isNaN(dt.getTime())) {
                  const isoDate = att.StartDateTime.split('T')[0];
                  if (!rosteredDateMap.has(isoDate)) {
                    rosteredDateMap.set(isoDate, new Set());
                  }
                  const timeSet = rosteredDateMap.get(isoDate)!;

                  const hours = dt.getHours();
                  const minutes = dt.getMinutes();
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  const h12 = hours % 12 || 12;
                  const minStr = minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ':00';
                  
                  timeSet.add(`${h12}${minStr} ${ampm}`.toLowerCase());
                  timeSet.add(`${h12}${ampm}`.toLowerCase());
                  timeSet.add(`${h12} ${ampm}`.toLowerCase());
                  timeSet.add(`${h12}${minStr}${ampm}`.toLowerCase());
                }
              }
            }
          }
        } catch (attErr) {
          console.warn('Error fetching user attendances for roster filtering:', attErr);
        }
      }

      // Standalone 'am'/'pm' are intentionally excluded — they match almost every channel name
      // and produce false positives that let view-only users see the wrong service time.
      const allKnownTimes = [
        '9:00 am', '9am', '9:00am',
        '10:00 am', '10am', '10:00am',
        '11:00 am', '11am', '11:00am',
        '11:30 am', '11:30am',
        '12:00 pm', '12pm', '12noon', 'noon',
        '1:00 pm', '1pm', '1:00pm',
        '2:00 pm', '2pm', '2:00pm',
        '3:00 pm', '3pm', '3:00pm',
        '4:00 pm', '4pm', '4:00pm',
        '5:00 pm', '5pm', '5:00pm',
        '5:30 pm', '5:30pm',
        '6:00 pm', '6pm', '6:00pm',
        '7:00 pm', '7pm', '7:00pm',
        '8:00 pm', '8pm', '8:00pm',
      ];

      // Filter channels matching rostered date AND schedule time
      if (allRosteredDateTokens.size > 0) {
        available = available.filter((channel) => {
          const nameLower = channel.Name.toLowerCase();
          
          // 1. Must match at least one rostered date representation
          const matchesDate = Array.from(allRosteredDateTokens).some((token) => nameLower.includes(token));
          if (!matchesDate) return false;

          // 2. Check if channel name specifies a specific service time
          const channelTimes = allKnownTimes.filter((t) => nameLower.includes(t));
          if (channelTimes.length === 0) {
            // No specific time in channel title -> date match is sufficient
            return true;
          }

          // If channel specifies a time, user must be rostered for a matching time on that date.
          // Use strict equality — substring matching ("am" inside "10:00 am") caused false positives.
          for (const [isoDate, times] of rosteredDateMap.entries()) {
            const dateTokens = buildDateMatchingTokens(isoDate);
            const channelMatchesThisDate = dateTokens.some((tok) => nameLower.includes(tok));
            if (channelMatchesThisDate) {
              const hasMatchingTime = Array.from(times).some((userTime) =>
                channelTimes.some((ct) => ct === userTime)
              );
              if (hasMatchingTime) return true;
            }
          }

          // Channel has a specific time but none of the user's rostered times match — exclude it.
          return false;
        });
      } else {
        // If user has no rostered attendances, return empty list for view-only user
        available = [];
      }
    }

    const formattedChannels: RunsheetChannelOption[] = available.map((c) => ({
      id: c.Id,
      name: c.Name,
    }));

    return {
      success: true,
      channels: formattedChannels,
    };
  } catch (err: any) {
    console.error('Error fetching runsheet channels from Rock:', err);
    return {
      success: false,
      channels: [],
      error: err?.message || 'Failed to fetch runsheet channels',
    };
  }
}
