import { NextResponse } from 'next/server';
import { buildAttachmentKey } from '@/lib/runsheetAttachments';
import { uploadAsset } from '@/server-actions/internal/rockAssetStorage';
import { assertAttachmentAccess } from '../assertAttachmentAccess';

export const dynamic = 'force-dynamic';

/** Every PDF starts with these bytes; a content type alone is caller-controlled. */
const PDF_MAGIC = '%PDF-';

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }

  const channelId = Number(form.get('channelId'));
  const itemId = Number(form.get('itemId'));
  const file = form.get('file');

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Invalid runsheet row.' }, { status: 400 });
  }

  const access = await assertAttachmentAccess(channelId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  if (!(file instanceof Blob) || typeof (file as File).name !== 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const upload = file as File;
  const head = await upload.slice(0, 5).text();
  if (upload.type !== 'application/pdf' || head !== PDF_MAGIC) {
    return NextResponse.json({ error: 'Only PDF files can be attached.' }, { status: 400 });
  }

  const key = buildAttachmentKey(access.channelName || '', itemId, upload.name);

  try {
    await uploadAsset(key, upload, upload.name);
  } catch {
    // Most likely the Rock/IIS request-body ceiling; say so instead of failing silently.
    return NextResponse.json(
      { error: 'Rock rejected this upload. The file may be larger than the server allows.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    key,
    name: upload.name,
    size: upload.size,
    uploadedAt: new Date().toISOString(),
  });
}
