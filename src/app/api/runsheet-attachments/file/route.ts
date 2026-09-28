import { NextResponse } from 'next/server';
import { isAllowedAttachmentKey } from '@/lib/runsheetAttachments';
import { deleteAsset, fetchAsset } from '@/server-actions/internal/rockAssetStorage';
import { assertAttachmentAccess } from '../assertAttachmentAccess';

export const dynamic = 'force-dynamic';

function readParams(request: Request) {
  const { searchParams } = new URL(request.url);
  return {
    key: searchParams.get('key') || '',
    channelId: Number(searchParams.get('channelId')),
    download: searchParams.get('download') === '1',
  };
}

export async function GET(request: Request) {
  const { key, channelId, download } = readParams(request);

  const access = await assertAttachmentAccess(channelId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  if (!isAllowedAttachmentKey(key)) {
    return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400 });
  }

  try {
    const asset = await fetchAsset(key);
    const filename = key.split('/').pop() || 'notes.pdf';
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      // Private: the proxy is the gate, so no shared cache may keep a copy.
      'Cache-Control': 'private, no-store',
    });
    if (asset.contentLength) headers.set('Content-Length', asset.contentLength);
    return new Response(asset.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const { key, channelId } = readParams(request);

  const access = await assertAttachmentAccess(channelId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  if (!isAllowedAttachmentKey(key)) {
    return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400 });
  }

  // `false` means Rock exposes no asset delete; the caller still drops the
  // entry from the attribute and the file is left as an orphan.
  const removedFromRock = await deleteAsset(key);
  return NextResponse.json({ success: true, removedFromRock });
}
