import { NextResponse } from 'next/server';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { formatContentDisposition, isValidNotePath } from '@/lib/preacherNotes';
import { fetchRockContent } from '@/server-actions/internal/rockContentUpload';
import { getPreacherNotesAttributeValue } from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelIdParam = searchParams.get('channelId');
    const pathParam = searchParams.get('path');
    const downloadParam = searchParams.get('download');
    const dispositionParam = searchParams.get('disposition');

    if (!channelIdParam || !/^[1-9]\d*$/.test(channelIdParam)) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    const channelId = Number(channelIdParam);
    if (!Number.isSafeInteger(channelId)) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    if (!pathParam || typeof pathParam !== 'string') {
      return NextResponse.json({ error: 'Missing note path.' }, { status: 400 });
    }

    // Enforce edit access
    const session = await getRockSession();
    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    // Validate path structure and ensure it matches the channel
    if (!isValidNotePath(pathParam, channelId)) {
      return NextResponse.json({ error: 'Invalid note path.' }, { status: 400 });
    }

    // Ensure path is in that channel's saved list
    const notes = await getPreacherNotesAttributeValue(channelId);
    const matchedNote = notes.find((n) => n.path === pathParam);
    if (!matchedNote) {
      return NextResponse.json({ error: 'Note not found on this runsheet.' }, { status: 404 });
    }

    // Fetch and stream from Rock
    let rockResponse: Response;
    try {
      rockResponse = await fetchRockContent(pathParam);
    } catch (rockError) {
      console.error('Failed to fetch content from Rock:', rockError);
      return NextResponse.json({ error: 'Could not fetch file from storage.' }, { status: 404 });
    }

    const isDownload = downloadParam === 'true' || dispositionParam === 'attachment';
    const contentDisposition = formatContentDisposition(matchedNote.name, isDownload);

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Content-Disposition', contentDisposition);

    const contentLength = rockResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(rockResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Preacher notes file route error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
