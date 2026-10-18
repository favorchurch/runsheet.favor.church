'use server';

import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { hasGrowRole } from '@/lib/permissions';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { canEditRunsheetChannel, canViewRunsheetChannel } from '@/lib/runsheetChannelAccess';
import { fetchGrowSchedules } from '@/server-actions/internal/rockGrowSchedules';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

export interface RunsheetChannelOption {
  id: number;
  name: string;
  time: string;
}

import { extractChannelDate, extractChannelTime, sortRunsheetChannels } from '@/lib/runsheetDate';
import { isMasterTemplateName } from '@/lib/runsheetTemplate';

function getTimezoneForChannelName(name: string): string {
  switch (extractRunsheetCampus(name)) {
    case 'BNE':
      return 'Australia/Brisbane';
    case 'SEL':
      return 'Asia/Seoul';
    case 'MNL':
    default:
      return 'Asia/Manila';
  }
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
    const access = assertRunsheetViewAccess(session);
    if (!access.allowed) {
      return { success: false, channels: [], error: access.error };
    }

    // Fetch Content Channels from Rock RMS for ContentChannelTypeId 13 ("Service Runsheet")
    const channels = (await rockGet(
      '/ContentChannels',
      {
        $filter: 'ContentChannelTypeId eq 13',
        $select: 'Id,Name,ContentChannelTypeId',
        $orderby: 'Id desc',
        $top: 200,
      }
    )) as Array<{ Id: number; Name: string }> | null;

    // Campus isolation applies to everyone; Grow roles add Grow Course
    // channels on top (see lib/runsheetChannelAccess). A past runsheet is
    // listed only when archived ones were asked for and the caller may edit
    // that channel; view-only access never reaches finished runsheets.
    const growSchedules = hasGrowRole(session) ? await fetchGrowSchedules() : [];
    let available = (channels || []).filter(
      (c) =>
        canViewRunsheetChannel(session, c.Name, growSchedules) &&
        (!isChannelPast(c.Name) || (includeArchived && canEditRunsheetChannel(session, c.Name, growSchedules))),
    );

    // Master templates are opened via "Edit Master Template", never listed —
    // this also keeps them out of sibling resolution for propagation.
    available = available.filter((c) => !isMasterTemplateName(c.Name));

    const formattedChannels: RunsheetChannelOption[] = available.map((c) => ({
      id: c.Id,
      name: c.Name,
      time: extractChannelTime(c.Name),
    }));

    return {
      success: true,
      channels: sortRunsheetChannels(formattedChannels),
    };
  } catch (err: any) {
    console.error('Error fetching runsheet channels from Rock:', err);
    return {
      success: false,
      channels: [],
      error: 'Failed to fetch runsheet channels',
    };
  }
}
