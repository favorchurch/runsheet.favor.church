import { NextResponse } from 'next/server';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { getPreacherNotesAttributeValue } from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelIdParam = searchParams.get('channelId');

    if (!channelIdParam || !/^[1-9]\d*$/.test(channelIdParam)) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    const channelId = Number(channelIdParam);
    if (!Number.isSafeInteger(channelId)) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    let session;
    try {
      session = await getRockSession();
    } catch {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const notes = await getPreacherNotesAttributeValue(channelId);
    return NextResponse.json({ success: true, notes });
  } catch (error) {
    console.error('Failed to list preacher notes:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
