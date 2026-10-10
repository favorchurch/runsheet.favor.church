import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  buildRunsheetExportModel,
  renderRunsheetPdf,
  RUNSHEET_ERROR_STATUS_MAP,
} from '@/lib/runsheetExport';
import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { assertRunsheetViewAccess } from '@/server-actions/runsheetAuthorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawChannelId = url.searchParams.get('channelId');

  // 1. Rejects non-numeric or non-positive channelId -> 400
  if (!rawChannelId || !/^\d+$/.test(rawChannelId)) {
    return Response.json({ error: 'Invalid channel ID.' }, { status: 400 });
  }

  const channelId = Number(rawChannelId);
  if (!Number.isSafeInteger(channelId) || channelId <= 0) {
    return Response.json({ error: 'Invalid channel ID.' }, { status: 400 });
  }

  // 2. Calls getRockSession(); throw or null session -> 401
  let session;
  try {
    session = await getRockSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Calls assertRunsheetViewAccess; failure -> 403
  const access = assertRunsheetViewAccess(session);
  if (!access.allowed) {
    return Response.json({ error: access.error || 'Forbidden' }, { status: 403 });
  }

  // 4. Calls rockGetRunsheetDetails(channelId) and maps result by exact error string
  const detailsResult = await rockGetRunsheetDetails(channelId);
  if (!detailsResult.success || !detailsResult.data) {
    const errorString = detailsResult.error ?? '';
    const mappedStatus = RUNSHEET_ERROR_STATUS_MAP[errorString];
    if (mappedStatus !== undefined) {
      return Response.json({ error: errorString }, { status: mappedStatus });
    }
    // Generic body and no PDF bytes on 500
    return Response.json({ error: 'Failed to fetch runsheet details' }, { status: 500 });
  }

  // Build model and render PDF
  const model = buildRunsheetExportModel(detailsResult.data);
  const pdfBuffer = await renderRunsheetPdf(model);

  const rawName = (detailsResult.data.name || `runsheet-${channelId}`).trim();
  const asciiSlug =
    rawName
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[-\s]+/g, '_') || `runsheet_${channelId}`;
  const asciiFilename = `${asciiSlug}.pdf`;
  const unicodeFilename = `${rawName}.pdf`;

  const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(unicodeFilename)}`;

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
