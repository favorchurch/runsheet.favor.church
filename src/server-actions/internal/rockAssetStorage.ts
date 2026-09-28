/**
 * Byte-level access to Rock's Asset Manager (`Local Content` provider, Id 1).
 *
 * `rockFetch` is deliberately not used here: it JSON-encodes request bodies and
 * JSON-parses responses, and this module moves multipart uploads and PDF
 * streams. Everything else in the app still goes through `rockFetch`.
 */
import 'server-only';
import { ROCK_API_KEY, ROCK_API_URL } from '@/constants/server';

/** The only configured AssetStorageProvider; see the design spec. */
export const ASSET_STORAGE_PROVIDER_ID = 1;

/** `ROCK_API_URL` ends in `/api`; the asset handlers live at the site root. */
function rockRoot(): string {
  return ROCK_API_URL.replace(/\/api\/?$/, '');
}

function authHeaders(): Record<string, string> {
  return { 'Authorization-Token': ROCK_API_KEY };
}

export async function uploadAsset(key: string, file: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append('file', file, filename);

  const url =
    `${rockRoot()}/FileUploader.ashx?IsAssetStorageProviderAsset=True` +
    `&StorageId=${ASSET_STORAGE_PROVIDER_ID}&Key=${encodeURIComponent(key)}`;

  const response = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Rock asset upload failed: ${response.status} ${detail.slice(0, 200)}`);
  }
}

export async function fetchAsset(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array> | null; contentLength: string | null }> {
  const path = key.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${rockRoot()}/Content/${path}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Rock asset read failed: ${response.status}`);
  }
  return { body: response.body, contentLength: response.headers.get('content-length') };
}

/**
 * Returns false — rather than throwing — when Rock exposes no REST delete for
 * assets. The caller still drops the entry from the attribute, leaving an
 * orphaned file to be cleared by hand in the Asset Manager.
 */
export async function deleteAsset(key: string): Promise<boolean> {
  const url =
    `${rockRoot()}/api/AssetStorageProviders/DeleteAsset` +
    `?assetStorageProviderId=${ASSET_STORAGE_PROVIDER_ID}&key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { method: 'DELETE', headers: authHeaders() });
  return response.ok;
}
