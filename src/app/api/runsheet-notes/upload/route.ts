import { NextResponse } from 'next/server';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  buildPreacherNotesFolder,
  isPdf,
  PREACHER_NOTES_MAX_BYTES,
} from '@/lib/preacherNotes';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { uploadRockContent } from '@/server-actions/internal/rockContentUpload';
import {
  getPreacherNotesAttributeValue,
  setPreacherNotesAttributeValue,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { PreacherNote } from '@/types/PreacherNotes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryChannelId = searchParams.get('channelId');

    const session = await getRockSession();

    // If channelId is present in searchParams, verify access before parsing formData
    if (queryChannelId) {
      const channelIdNum = Number(queryChannelId);
      if (!Number.isSafeInteger(channelIdNum) || channelIdNum <= 0) {
        return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
      }
      const access = await assertRunsheetEditAccess(session, channelIdNum);
      if (!access.allowed) {
        return NextResponse.json({ error: access.error }, { status: 403 });
      }
    }

    const formData = await request.formData();
    const rawChannelId = queryChannelId || (formData.get('channelId') as string);
    const channelId = Number(rawChannelId);

    if (!Number.isSafeInteger(channelId) || channelId <= 0) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    // Verify access before reading/processing the file
    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    // Reject non-PDF MIME type
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
    }

    // Reject files exceeding maximum size
    if (file.size > PREACHER_NOTES_MAX_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum allowed size (4.4 MB).' },
        { status: 413 },
      );
    }

    // Sniff magic bytes for %PDF-
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!isPdf(buffer)) {
      return NextResponse.json(
        { error: 'Invalid file: magic bytes do not match PDF format.' },
        { status: 400 },
      );
    }

    // Determine campus and build folder path
    const campus = access.channelName ? extractRunsheetCampus(access.channelName) : null;
    const folderPath = buildPreacherNotesFolder(campus, channelId);
    const fileName = (file as any).name || 'document.pdf';

    // Upload to Rock
    const returnedPath = await uploadRockContent(folderPath, buffer, fileName);

    // Save attribute to ContentChannel
    const currentNotes = await getPreacherNotesAttributeValue(channelId);
    const newEntry: PreacherNote = {
      name: fileName,
      path: returnedPath,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    const updatedNotes = [...currentNotes, newEntry];

    try {
      await setPreacherNotesAttributeValue(channelId, updatedNotes);
    } catch (saveError) {
      console.error('Failed to save preacher notes attribute after upload:', saveError);
      return NextResponse.json(
        { error: 'The file reached Rock but was not linked to the runsheet.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, notes: updatedNotes });
  } catch (error) {
    console.error('Preacher notes upload error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during upload.' }, { status: 500 });
  }
}
