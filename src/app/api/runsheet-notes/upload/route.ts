import { NextResponse } from 'next/server';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import {
  buildPreacherNotesFileName,
  buildPreacherNotesFolder,
  computePreacherNotesQueryString,
  isPdf,
  isValidNotePath,
  PREACHER_NOTES_COUNT_ERROR_MESSAGE,
  PREACHER_NOTES_LENGTH_ERROR_MESSAGE,
  PREACHER_NOTES_MAX_BYTES,
  PREACHER_NOTES_MAX_COUNT,
  PREACHER_NOTES_MAX_NAME_LENGTH,
  PREACHER_NOTES_MAX_QUERY_STRING_LENGTH,
  PreacherNotesCountLimitError,
  PreacherNotesLengthLimitError,
} from '@/lib/preacherNotes';
import { extractRunsheetCampus } from '@/lib/runsheetCampus';
import { RockContentExistsError, uploadRockContent } from '@/server-actions/internal/rockContentUpload';
import {
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';
import type { PreacherNote } from '@/types/PreacherNotes';

export const dynamic = 'force-dynamic';

const MAX_NAME_ATTEMPTS = 10;

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
    const folderPath = buildPreacherNotesFolder(campus);

    // Named `YYYY-MM-DD <Service Time> <original name>.pdf`; the same name is shown in the panel.
    const originalFileName = (file as any).name || 'document.pdf';
    const storageFileName = buildPreacherNotesFileName(access.channelName, originalFileName);
    const displayName = storageFileName.slice(0, PREACHER_NOTES_MAX_NAME_LENGTH);

    // Fast-path 1: Enforce 10 notes maximum per runsheet before sending to Rock
    const currentNotes = await getPreacherNotesAttributeValue(channelId);
    if (currentNotes.length >= PREACHER_NOTES_MAX_COUNT) {
      return NextResponse.json(
        { error: PREACHER_NOTES_COUNT_ERROR_MESSAGE },
        { status: 400 },
      );
    }

    // Fast-path 2: Enforce query string length budget before sending to Rock
    const candidatePath = `${folderPath}${storageFileName}`;
    const candidateEntry: PreacherNote = {
      name: displayName,
      path: candidatePath,
    };
    const wouldBeNotes = [...currentNotes, candidateEntry];
    const candidateQueryString = computePreacherNotesQueryString(wouldBeNotes);

    if (candidateQueryString.length > PREACHER_NOTES_MAX_QUERY_STRING_LENGTH) {
      return NextResponse.json(
        { error: PREACHER_NOTES_LENGTH_ERROR_MESSAGE },
        { status: 400 },
      );
    }

    // Upload to Rock. Rock never overwrites, so a taken name retries as `<name>_2.pdf`, `_3`, ...
    let returnedPath = '';
    let uploadName = storageFileName;
    for (let attempt = 1; !returnedPath; attempt++) {
      uploadName = buildPreacherNotesFileName(access.channelName, originalFileName, attempt);
      try {
        returnedPath = await uploadRockContent(folderPath, buffer, uploadName);
      } catch (uploadError) {
        if (!(uploadError instanceof RockContentExistsError) || attempt >= MAX_NAME_ATTEMPTS) throw uploadError;
      }
    }

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
        if (currentNotes.length >= PREACHER_NOTES_MAX_COUNT) {
          throw new PreacherNotesCountLimitError(PREACHER_NOTES_COUNT_ERROR_MESSAGE);
        }

        const newEntry: PreacherNote = {
          name: uploadName.slice(0, PREACHER_NOTES_MAX_NAME_LENGTH),
          path: returnedPath,
        };
        const nextList = [...currentNotes, newEntry];
        const queryString = computePreacherNotesQueryString(nextList);

        if (queryString.length > PREACHER_NOTES_MAX_QUERY_STRING_LENGTH) {
          throw new PreacherNotesLengthLimitError(PREACHER_NOTES_LENGTH_ERROR_MESSAGE);
        }

        return nextList;
      });

      return NextResponse.json({ success: true, notes: updatedNotes });
    } catch (saveError: any) {
      if (
        saveError instanceof PreacherNotesCountLimitError ||
        saveError?.name === 'PreacherNotesCountLimitError'
      ) {
        return NextResponse.json(
          { error: saveError.message || PREACHER_NOTES_COUNT_ERROR_MESSAGE },
          { status: 400 },
        );
      }
      if (
        saveError instanceof PreacherNotesLengthLimitError ||
        saveError?.name === 'PreacherNotesLengthLimitError'
      ) {
        return NextResponse.json(
          { error: saveError.message || PREACHER_NOTES_LENGTH_ERROR_MESSAGE },
          { status: 400 },
        );
      }
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
