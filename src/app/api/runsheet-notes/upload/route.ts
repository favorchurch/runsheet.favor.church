import { NextResponse } from 'next/server';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  buildPreacherNotesFolder,
  isPdf,
  isValidNotePath,
  PREACHER_NOTES_MAX_BYTES,
  sanitizeStorageFileName,
} from '@/lib/preacherNotes';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { uploadRockContent } from '@/server-actions/internal/rockContentUpload';
import { mutatePreacherNotesAttribute } from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { PreacherNote } from '@/types/PreacherNotes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelIdParam = searchParams.get('channelId');

    // Require channelId in query string and validate it
    if (!channelIdParam || !/^[1-9]\d*$/.test(channelIdParam)) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    const channelId = Number(channelIdParam);
    if (!Number.isSafeInteger(channelId) || channelId <= 0) {
      return NextResponse.json({ error: 'Invalid channel id.' }, { status: 400 });
    }

    // Call assertRunsheetEditAccess strictly before request.formData()
    const session = await getRockSession();
    const access = await assertRunsheetEditAccess(session, channelId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const formData = await request.formData();
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

    // Keep the original as the display name, and derive a safe storage name for Rock
    const originalFileName = (file as any).name || 'document.pdf';
    const storageFileName = sanitizeStorageFileName(originalFileName);

    // Upload to Rock
    const returnedPath = await uploadRockContent(folderPath, buffer, storageFileName);

    // Validate the returned path against channelId
    if (!isValidNotePath(returnedPath, channelId)) {
      return NextResponse.json(
        { error: 'The file reached Rock but was not linked to the runsheet.' },
        { status: 500 },
      );
    }

    // Read, append, and write serialized per channelId
    try {
      const updatedNotes = await mutatePreacherNotesAttribute(channelId, (currentNotes) => {
        const newEntry: PreacherNote = {
          name: originalFileName,
          path: returnedPath,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };
        return [...currentNotes, newEntry];
      });

      return NextResponse.json({ success: true, notes: updatedNotes });
    } catch (saveError) {
      console.error('Failed to save preacher notes attribute after upload:', saveError);
      return NextResponse.json(
        { error: 'The file reached Rock but was not linked to the runsheet.' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Preacher notes upload error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during upload.' }, { status: 500 });
  }
}
