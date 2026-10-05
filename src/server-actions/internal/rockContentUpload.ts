import 'server-only';

import { ROCK_API_KEY, ROCK_API_URL } from '@/constants/server';

/**
 * Returns the Rock site root by stripping `/api` (and any trailing slash).
 */
export function getRockRootUrl(): string {
  return ROCK_API_URL.replace(/\/api\/?$/, '');
}

export const ROCK_CONTENT_TIMEOUT_MS = 15000;

/** Rock's uploader refuses to overwrite: 400 "File already exists." */
export class RockContentExistsError extends Error {
  constructor() {
    super('Rock upload failed: file already exists');
    this.name = 'RockContentExistsError';
  }
}

function formatNetworkErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string' && (error as any).message) {
    return (error as any).message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * Posts multipart form data to `{ROCK_ROOT}/FileUploader.ashx` with:
 * - `Authorization-Token` header
 * - form fields: `FolderPath` and `file`
 *
 * Returns the `FileName` property from Rock's JSON response.
 * Throws a sanitized error on non-2xx (no API token, no raw upstream body).
 */
export async function uploadRockContent(
  folderPath: string,
  file: Blob | File | Buffer,
  filename?: string,
): Promise<string> {
  const rootUrl = getRockRootUrl();
  const uploadUrl = `${rootUrl}/FileUploader.ashx`;

  const formData = new FormData();
  formData.append('FolderPath', folderPath);

  const resolvedName = filename || (file as any).name || 'file.pdf';
  if (Buffer.isBuffer(file)) {
    const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    formData.append('file', blob, resolvedName);
  } else {
    formData.append('file', file as Blob, resolvedName);
  }

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization-Token': ROCK_API_KEY,
      },
      body: formData,
      signal: AbortSignal.timeout(ROCK_CONTENT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Rock upload network error: ${formatNetworkErrorMessage(error)}`);
  }

  if (response.status === 400 && /already exists/i.test(await response.text().catch(() => ''))) {
    throw new RockContentExistsError();
  }

  if (!response.ok) {
    // Sanitized error: never leak ROCK_API_KEY or raw response body
    throw new Error(`Rock upload failed with status ${response.status}: ${response.statusText || 'Upload error'}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('Rock upload failed: invalid JSON response from server');
  }

  if (!data || typeof data.FileName !== 'string' || !data.FileName.trim()) {
    throw new Error('Rock upload failed: response missing FileName');
  }

  return data.FileName.trim();
}

/**
 * Encodes a relative note path for `{ROCK_ROOT}/Content/<encoded path>`.
 */
export function buildRockContentUrl(path: string): string {
  const rootUrl = getRockRootUrl();
  const cleanPath = path.replace(/^\/+/, '');
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  return `${rootUrl}/Content/${encodedPath}`;
}

/**
 * Fetches `{ROCK_ROOT}/Content/<encoded path>` from Rock.
 * Throws a sanitized error on non-2xx.
 */
export async function fetchRockContent(path: string): Promise<Response> {
  const url = buildRockContentUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization-Token': ROCK_API_KEY,
      },
      signal: AbortSignal.timeout(ROCK_CONTENT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Rock fetch network error: ${formatNetworkErrorMessage(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Rock fetch failed with status ${response.status}: ${response.statusText || 'Fetch error'}`);
  }

  return response;
}

/**
 * Fetches `{ROCK_ROOT}/Content/<encoded path>` and returns the body ReadableStream.
 */
export async function fetchRockContentStream(path: string): Promise<ReadableStream<Uint8Array> | null> {
  const response = await fetchRockContent(path);
  return response.body;
}
