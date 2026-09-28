# Runsheet PDF Attachments (Preacher Notes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a runsheet editor attach one or more PDFs to a runsheet row, stored in Rock's Asset Manager, saved to Rock the instant each upload finishes, and opened in an in-app viewer with a download button.

**Architecture:** A channel opts in by having a Text item attribute `PREACHERNOTES` on its `ContentChannelItem`s. Its value is a JSON array of `{key, name, size, uploadedAt}`, where `key` is an Asset Manager asset key under `PreacherNotes/<CAMPUS>/<itemId>/<random>/<filename>`. Uploads, reads and deletes go through app-owned route handlers that gate on `canEditRunsheetChannel`; the attribute write is a server action following `src/server-actions/README.md`.

**Tech Stack:** Next.js App Router (route handlers, server actions), TypeScript, Rock RMS REST + `FileUploader.ashx`, Jest (`jest-environment-node`, ts-jest), Tailwind, React Query (already used by the editor).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-28-runsheet-pdf-attachments-design.md`. Read it before Task 1.
- Accepted risk, verbatim from the spec: Asset Manager files on a file-system provider are served as static content with no per-file Rock security; anyone holding the raw URL can fetch the PDF. The app must never render the raw asset URL in the page — only its own proxy route.
- PDF only. No app-side cap on file size or file count.
- Access rule for upload, read and delete: `canEditRunsheetChannel` for the item's channel. Viewers (rostered, Grow) get no UI and a 403 on the routes.
- Asset storage provider: `Local Content`, Id `1` (verified against the live API — it is the only provider configured).
- Campus codes come from `extractRunsheetCampus()` in `src/lib/runsheetCampus.ts` (`MNL` | `BNE` | `SEL`); no campus resolved means the `ALL` folder.
- Every server action starts with `'use server'`, authenticates, then authorizes — see `src/server-actions/README.md`.
- All Rock REST goes through `rockGet`/`rockPost`/`rockPatch`/`rockDelete` from `src/server-actions/internal/rockFetch.ts`. Asset binary transfer is the one exception and gets its own helper (Task 2).
- Per `AGENTS.md`, bump the version in `package.json` with semver. This feature is a minor bump: `1.20.4` → `1.21.0`, done once in Task 8.
- Run `pnpm test` for tests and `pnpm typecheck` before each commit that touches TypeScript.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/runsheetAttachments.ts` (create) | Pure: parse/serialise the attribute value, build and validate asset keys. No I/O. |
| `src/lib/runsheetAttachments.test.ts` (create) | Unit tests for the above. |
| `src/server-actions/internal/rockAssetStorage.ts` (create) | The only module that talks to Rock's asset endpoints: upload, fetch bytes, delete. |
| `src/server-actions/internal/rockAssetStorage.test.ts` (create) | Unit tests with `global.fetch` mocked. |
| `src/server-actions/rockSetRunsheetItemAttachments.ts` (create) | Server action that writes the `PREACHERNOTES` AttributeValue. |
| `src/server-actions/rockSetRunsheetItemAttachments.access.test.ts` (create) | Access test: a viewer is rejected and nothing is written. |
| `src/app/api/runsheet-attachments/upload/route.ts` (create) | `POST` multipart upload. |
| `src/app/api/runsheet-attachments/file/route.ts` (create) | `GET` inline/download proxy, `DELETE` remove. |
| `src/app/api/runsheet-attachments/routeAccess.test.ts` (create) | Access tests for both routes. |
| `src/components/runsheet/RunsheetAttachmentsCell.tsx` (create) | The paperclip toggle, the per-row panel, upload/delete wiring. |
| `src/components/runsheet/PdfViewerModal.tsx` (create) | Inline PDF viewer with a download button. |
| `src/components/runsheet/RunsheetTableEditor.tsx` (modify) | Render hook only: route the `PREACHERNOTES` column to the new cell, hide it for viewers, and exclude it from the grid's own save diff. |
| `package.json` (modify) | Version bump. |
| `README.md` (modify) | Document the attribute and the campus folder layout. |

---

### Task 0: Spike — can the API key upload and delete assets?

This is a throwaway investigation against **rock-preview**, not production, and it decides whether the rest of the plan is viable. Rock's asset endpoints are `.ashx` handlers and Rock block actions, which have historically wanted an authenticated session cookie rather than an `Authorization-Token` API key. Nothing else in this plan is written until this is answered.

**Files:**
- Create: `scripts/spike-asset-upload.ts` (deleted again at the end of this task)

- [ ] **Step 1: Write the spike script**

```ts
/**
 * Throwaway spike: does Rock accept an API key for Asset Manager uploads?
 * Run against rock-preview only. Delete this file when the question is answered.
 */
const BASE = process.env.ROCK_SPIKE_BASE_URL || 'https://rock-preview.favor.church';
const KEY = process.env.ROCK_SPIKE_API_KEY || '';
const PDF = Buffer.from('%PDF-1.4\n%spike\n');

async function main() {
  const key = `PreacherNotes/MNL/spike/${Date.now()}-spike.pdf`;
  const form = new FormData();
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'spike.pdf');

  const uploadUrl =
    `${BASE}/FileUploader.ashx?IsAssetStorageProviderAsset=True&StorageId=1` +
    `&Key=${encodeURIComponent(key)}`;
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Authorization-Token': KEY },
    body: form,
  });
  console.log('UPLOAD', upload.status, (await upload.text()).slice(0, 400));

  const read = await fetch(`${BASE}/Content/${key.split('/').map(encodeURIComponent).join('/')}`);
  console.log('READ (anonymous)', read.status, read.headers.get('content-type'));

  const del = await fetch(
    `${BASE}/api/AssetStorageProviders/DeleteAsset?assetStorageProviderId=1&key=${encodeURIComponent(key)}`,
    { method: 'DELETE', headers: { 'Authorization-Token': KEY } },
  );
  console.log('DELETE', del.status, (await del.text()).slice(0, 400));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against rock-preview**

Run:
```bash
ROCK_SPIKE_BASE_URL=https://rock-preview.favor.church \
ROCK_SPIKE_API_KEY=<preview api key> \
npx tsx scripts/spike-asset-upload.ts
```

Record all three status codes. Expected outcomes and what each means:

- `UPLOAD 200` — the API key works; proceed with the plan as written.
- `UPLOAD 401/403`, or an HTML login page in the body — the API key is refused. **Stop and report to the user.** The fallback is BinaryFile storage (`POST /api/BinaryFiles/Upload`, which the API key does support), which changes the storage decision the user made and must go back to them before any further work.
- `DELETE 404` — Rock exposes no REST delete for assets. This does not block the feature. Proceed, and implement delete as reference-removal only (Task 4 covers this): the entry leaves the attribute, the file stays on disk as an orphan, cleaned up by hand in the Asset Manager. Note the outcome in the task report.
- `READ 200` anonymously — confirms the accepted public-URL risk. Expected, not a blocker.

- [ ] **Step 3: Remove the spike and report**

```bash
rm scripts/spike-asset-upload.ts
```

Report the three status codes to the user before starting Task 1. No commit — nothing durable was produced.

---

### Task 1: Attachment value parsing and asset keys

**Files:**
- Create: `src/lib/runsheetAttachments.ts`
- Test: `src/lib/runsheetAttachments.test.ts`

**Interfaces:**
- Consumes: `extractRunsheetCampus`, `ALL_CAMPUSES` from `@/lib/runsheetCampus`.
- Produces:
  - `PREACHER_NOTES_ATTRIBUTE_KEY = 'PREACHERNOTES'`
  - `interface RunsheetAttachment { key: string; name: string; size: number; uploadedAt: string }`
  - `parseAttachments(value: string | undefined | null): RunsheetAttachment[]`
  - `serializeAttachments(entries: RunsheetAttachment[]): string`
  - `buildAttachmentKey(channelName: string, itemId: number, filename: string, random?: string): string`
  - `isAllowedAttachmentKey(key: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import {
  buildAttachmentKey,
  isAllowedAttachmentKey,
  parseAttachments,
  serializeAttachments,
  type RunsheetAttachment,
} from './runsheetAttachments';

const entry: RunsheetAttachment = {
  key: 'PreacherNotes/MNL/1042/9f3c/nov-2-notes.pdf',
  name: 'Nov 2 notes.pdf',
  size: 184320,
  uploadedAt: '2026-09-28T02:11:00.000Z',
};

describe('parseAttachments', () => {
  it('reads a stored array', () => {
    expect(parseAttachments(JSON.stringify([entry]))).toEqual([entry]);
  });

  it('treats absent, empty and malformed values as no attachments', () => {
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments('')).toEqual([]);
    expect(parseAttachments('   ')).toEqual([]);
    expect(parseAttachments('not json')).toEqual([]);
    expect(parseAttachments('{"key":"x"}')).toEqual([]);
  });

  it('drops entries that are not shaped like an attachment', () => {
    const mixed = JSON.stringify([entry, { key: 'a' }, null, { ...entry, size: 'big' }]);
    expect(parseAttachments(mixed)).toEqual([entry]);
  });

  it('round-trips through serialize', () => {
    expect(parseAttachments(serializeAttachments([entry]))).toEqual([entry]);
  });

  it('serializes an empty list as an empty string so Rock stores nothing', () => {
    expect(serializeAttachments([])).toBe('');
  });
});

describe('buildAttachmentKey', () => {
  it('partitions by campus and item, and slugifies the filename', () => {
    expect(buildAttachmentKey('MNL | 10AM Sunday Service', 1042, 'Nov 2 Notes.pdf', '9f3c')).toBe(
      'PreacherNotes/MNL/1042/9f3c/nov-2-notes.pdf',
    );
  });

  it('files a channel with no campus under ALL', () => {
    expect(buildAttachmentKey('Master Template', 7, 'notes.pdf', 'abcd')).toBe(
      'PreacherNotes/ALL/7/abcd/notes.pdf',
    );
  });

  it('strips path separators out of the filename', () => {
    expect(buildAttachmentKey('BNE | 9AM', 3, '../../etc/passwd.pdf', 'ffff')).toBe(
      'PreacherNotes/BNE/3/ffff/etc-passwd.pdf',
    );
  });
});

describe('isAllowedAttachmentKey', () => {
  it('accepts keys inside a campus folder', () => {
    expect(isAllowedAttachmentKey('PreacherNotes/SEL/9/abcd/notes.pdf')).toBe(true);
  });

  it('rejects traversal, other roots and non-pdf keys', () => {
    expect(isAllowedAttachmentKey('PreacherNotes/MNL/../../web.config')).toBe(false);
    expect(isAllowedAttachmentKey('Other/MNL/1/a/notes.pdf')).toBe(false);
    expect(isAllowedAttachmentKey('PreacherNotes/XXX/1/a/notes.pdf')).toBe(false);
    expect(isAllowedAttachmentKey('PreacherNotes/MNL/1/a/notes.exe')).toBe(false);
    expect(isAllowedAttachmentKey('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/runsheetAttachments.test.ts`
Expected: FAIL — cannot find module `./runsheetAttachments`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The `PREACHERNOTES` item attribute holds a JSON array of PDF attachments
 * stored in Rock's Asset Manager. Everything here is pure: no Rock I/O.
 *
 * A value this module cannot understand is read as "no attachments" rather
 * than throwing, so a hand-edited Rock value can never break the grid.
 */
import { ALL_CAMPUSES, extractRunsheetCampus, RUNSHEET_CAMPUS_CODES } from '@/lib/runsheetCampus';

export const PREACHER_NOTES_ATTRIBUTE_KEY = 'PREACHERNOTES';

/** Asset Manager root folder; every attachment key starts here. */
export const ATTACHMENT_ROOT = 'PreacherNotes';

export interface RunsheetAttachment {
  /** Asset Manager key: its path within the storage provider. */
  key: string;
  name: string;
  size: number;
  /** ISO 8601. */
  uploadedAt: string;
}

function isAttachment(value: unknown): value is RunsheetAttachment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    typeof candidate.uploadedAt === 'string'
  );
}

export function parseAttachments(value: string | undefined | null): RunsheetAttachment[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAttachment).map((entry) => ({
      key: entry.key,
      name: entry.name,
      size: entry.size,
      uploadedAt: entry.uploadedAt,
    }));
  } catch {
    return [];
  }
}

/** An empty list stores an empty string so Rock keeps no stray `[]` rows. */
export function serializeAttachments(entries: RunsheetAttachment[]): string {
  return entries.length ? JSON.stringify(entries) : '';
}

function slugifyFilename(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').filter(Boolean).join('-');
  return (
    base
      .toLowerCase()
      .replace(/\.pdf$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'notes'
  ) + '.pdf';
}

/**
 * `PreacherNotes/<CAMPUS>/<itemId>/<random>/<slug>.pdf`.
 *
 * The random segment keeps the URL unguessable from a service date or a
 * preacher's name. That is obscurity, not security — see the spec.
 */
export function buildAttachmentKey(
  channelName: string,
  itemId: number,
  filename: string,
  random: string = Math.random().toString(36).slice(2, 10),
): string {
  const campus = extractRunsheetCampus(channelName) || ALL_CAMPUSES;
  return `${ATTACHMENT_ROOT}/${campus}/${itemId}/${random}/${slugifyFilename(filename)}`;
}

const ALLOWED_FOLDERS = [...RUNSHEET_CAMPUS_CODES, ALL_CAMPUSES];

/** Guards the read and delete routes against reading arbitrary provider paths. */
export function isAllowedAttachmentKey(key: string): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) return false;
  if (!key.toLowerCase().endsWith('.pdf')) return false;
  const segments = key.split('/');
  if (segments.length < 5) return false;
  if (segments[0] !== ATTACHMENT_ROOT) return false;
  return ALLOWED_FOLDERS.includes(segments[1] as (typeof ALLOWED_FOLDERS)[number]);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/lib/runsheetAttachments.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runsheetAttachments.ts src/lib/runsheetAttachments.test.ts
git commit -m "feat: parse and build runsheet PDF attachment values"
```

---

### Task 2: Rock Asset Manager client

The only module that moves bytes to and from Rock. It uses `fetch` directly rather than `rockFetch`, because `rockFetch` JSON-encodes bodies and JSON-parses responses, and neither fits a multipart upload or a PDF stream.

**Files:**
- Create: `src/server-actions/internal/rockAssetStorage.ts`
- Test: `src/server-actions/internal/rockAssetStorage.test.ts`

**Interfaces:**
- Consumes: `ROCK_API_KEY`, `ROCK_API_URL` from `@/constants/server`.
- Produces:
  - `uploadAsset(key: string, file: Blob, filename: string): Promise<void>`
  - `fetchAsset(key: string): Promise<{ body: ReadableStream<Uint8Array> | null; contentLength: string | null }>`
  - `deleteAsset(key: string): Promise<boolean>` — `true` when Rock removed the file, `false` when Rock exposes no delete (Task 0 may have found a 404). Never throws for that case.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deleteAsset, fetchAsset, uploadAsset } from './rockAssetStorage';

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
});

describe('uploadAsset', () => {
  it('posts multipart to the asset uploader with the API key and the key as a query param', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' } as any);

    await uploadAsset('PreacherNotes/MNL/1/a/notes.pdf', new Blob([new Uint8Array([1])]), 'notes.pdf');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/FileUploader.ashx');
    expect(url).toContain('StorageId=1');
    expect(url).toContain(encodeURIComponent('PreacherNotes/MNL/1/a/notes.pdf'));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization-Token']).toBeTruthy();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws when Rock rejects the upload', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 413, text: async () => 'too large' } as any);

    await expect(
      uploadAsset('PreacherNotes/MNL/1/a/notes.pdf', new Blob([new Uint8Array([1])]), 'notes.pdf'),
    ).rejects.toThrow('413');
  });
});

describe('fetchAsset', () => {
  it('returns the body and content length', async () => {
    const headers = new Map([['content-length', '42']]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'stream',
      headers: { get: (name: string) => headers.get(name) ?? null },
    } as any);

    const result = await fetchAsset('PreacherNotes/MNL/1/a/notes.pdf');

    expect(result.contentLength).toBe('42');
    expect(result.body).toBe('stream');
  });

  it('throws when the asset is missing', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' } as any);
    await expect(fetchAsset('PreacherNotes/MNL/1/a/gone.pdf')).rejects.toThrow('404');
  });
});

describe('deleteAsset', () => {
  it('reports true when Rock deletes the file', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' } as any);
    await expect(deleteAsset('PreacherNotes/MNL/1/a/notes.pdf')).resolves.toBe(true);
  });

  it('reports false instead of throwing when Rock has no delete endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'no route' } as any);
    await expect(deleteAsset('PreacherNotes/MNL/1/a/notes.pdf')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server-actions/internal/rockAssetStorage.test.ts`
Expected: FAIL — cannot find module `./rockAssetStorage`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

If Task 0 found a working delete endpoint with a different shape, correct the URL in `deleteAsset` to match what the spike proved and adjust nothing else.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/server-actions/internal/rockAssetStorage.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/internal/rockAssetStorage.ts src/server-actions/internal/rockAssetStorage.test.ts
git commit -m "feat: add Rock Asset Manager client for runsheet attachments"
```

---

### Task 3: Server action to persist the attachment list

**Files:**
- Create: `src/server-actions/rockSetRunsheetItemAttachments.ts`
- Test: `src/server-actions/rockSetRunsheetItemAttachments.access.test.ts`

**Interfaces:**
- Consumes: `assertRunsheetEditAccess` from `@/server-actions/runsheetAuthorization`; `getRockSession` from `@/auth0-hooks/server/getRockSession`; `rockGet`, `rockPost`, `rockPatch` from `@/server-actions/internal/rockFetch`; `parseAttachments`, `serializeAttachments`, `PREACHER_NOTES_ATTRIBUTE_KEY`, `RunsheetAttachment` from `@/lib/runsheetAttachments`.
- Produces: `rockSetRunsheetItemAttachments(input: { channelId: number; itemId: number; attachments: RunsheetAttachment[] }): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { rockSetRunsheetItemAttachments } from './rockSetRunsheetItemAttachments';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockPost = jest.mocked(rockPost);

const attachment = {
  key: 'PreacherNotes/MNL/1042/9f3c/notes.pdf',
  name: 'notes.pdf',
  size: 10,
  uploadedAt: '2026-09-28T00:00:00.000Z',
};

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRockGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/ContentChannels/')) {
      return { Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 };
    }
    if (url.startsWith('/Attributes')) {
      return [{ Id: 555, Key: 'PREACHERNOTES' }];
    }
    return [];
  });
});

describe('rockSetRunsheetItemAttachments', () => {
  it('rejects a viewer and writes nothing', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(false);
    expect(mockRockPatch).not.toHaveBeenCalled();
    expect(mockRockPost).not.toHaveBeenCalled();
  });

  it('rejects an editor from another campus and writes nothing', async () => {
    mockGetRockSession.mockResolvedValue(session('BNE', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(false);
    expect(mockRockPatch).not.toHaveBeenCalled();
    expect(mockRockPost).not.toHaveBeenCalled();
  });

  it('creates the AttributeValue when none exists', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [attachment],
    });

    expect(result.success).toBe(true);
    expect(mockRockPost).toHaveBeenCalledWith('/AttributeValues', {
      AttributeId: 555,
      EntityId: 1042,
      Value: JSON.stringify([attachment]),
    });
  });

  it('patches the existing AttributeValue', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    mockRockGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/ContentChannels/')) {
        return { Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 };
      }
      if (url.startsWith('/Attributes')) return [{ Id: 555, Key: 'PREACHERNOTES' }];
      if (url.startsWith('/AttributeValues')) return [{ Id: 900, AttributeId: 555 }];
      return [];
    });

    await rockSetRunsheetItemAttachments({ channelId: 1, itemId: 1042, attachments: [] });

    expect(mockRockPatch).toHaveBeenCalledWith('/AttributeValues/900', { Value: '' });
  });

  it('rejects a malformed attachment list', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);

    const result = await rockSetRunsheetItemAttachments({
      channelId: 1, itemId: 1042, attachments: [{ key: '', name: '', size: -1, uploadedAt: '' }] as never,
    });

    expect(result.success).toBe(false);
    expect(mockRockPost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server-actions/rockSetRunsheetItemAttachments.access.test.ts`
Expected: FAIL — cannot find module `./rockSetRunsheetItemAttachments`.

- [ ] **Step 3: Write the implementation**

```ts
'use server';

import { z } from 'zod';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { PREACHER_NOTES_ATTRIBUTE_KEY, serializeAttachments, type RunsheetAttachment } from '@/lib/runsheetAttachments';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

/** `ContentChannelItem`; the entity the `PREACHERNOTES` attribute hangs off. */
const CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID = 209;

const attachmentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  uploadedAt: z.string().min(1),
});

const inputSchema = z.object({
  channelId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  attachments: z.array(attachmentSchema).max(500),
});

/**
 * Writes the whole attachment list for one runsheet row.
 *
 * Called immediately after each upload or delete, so the row is persisted
 * without waiting for the grid's own save.
 */
export async function rockSetRunsheetItemAttachments(input: {
  channelId: number;
  itemId: number;
  attachments: RunsheetAttachment[];
}): Promise<{ success: boolean; error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid attachment data.' };
  }
  const { channelId, itemId, attachments } = parsed.data;

  const session = await getRockSession();
  const access = await assertRunsheetEditAccess(session, channelId);
  if (!access.allowed) {
    return { success: false, error: access.error };
  }

  try {
    const attributes = (await rockGet(
      '/Attributes',
      {
        $filter:
          `Key eq '${PREACHER_NOTES_ATTRIBUTE_KEY}' and ` +
          `EntityTypeId eq ${CONTENT_CHANNEL_ITEM_ENTITY_TYPE_ID}`,
        $select: 'Id,Key',
      },
      true,
    )) as { Id?: number }[] | null;

    const attributeId = attributes?.[0]?.Id;
    if (!attributeId) {
      return { success: false, error: 'This runsheet does not have attachments enabled.' };
    }

    const existing = (await rockGet(
      '/AttributeValues',
      { $filter: `EntityId eq ${itemId} and AttributeId eq ${attributeId}`, $select: 'Id,AttributeId' },
      true,
    )) as { Id?: number }[] | null;

    const value = serializeAttachments(attachments);
    const existingId = existing?.[0]?.Id;

    if (existingId) {
      await rockPatch(`/AttributeValues/${existingId}`, { Value: value });
    } else if (value) {
      await rockPost('/AttributeValues', { AttributeId: attributeId, EntityId: itemId, Value: value });
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Could not save attachments to Rock.' };
  }
}
```

If the `PREACHERNOTES` attribute's `EntityTypeId` in this Rock instance is not `209`, confirm it with
`curl -H "Authorization-Token: $ROCK_API_KEY" "$ROCK_API_URL/EntityTypes?\$filter=Name eq 'Rock.Model.ContentChannelItem'&\$select=Id"`
and correct the constant.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/server-actions/rockSetRunsheetItemAttachments.access.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server-actions/rockSetRunsheetItemAttachments.ts src/server-actions/rockSetRunsheetItemAttachments.access.test.ts
git commit -m "feat: add server action to persist runsheet attachment list"
```

---

### Task 4: Upload, read and delete routes

One task, because the three handlers share the same gate helper and a reviewer would accept or reject them together.

**Files:**
- Create: `src/app/api/runsheet-attachments/upload/route.ts`
- Create: `src/app/api/runsheet-attachments/file/route.ts`
- Create: `src/app/api/runsheet-attachments/assertAttachmentAccess.ts`
- Test: `src/app/api/runsheet-attachments/routeAccess.test.ts`

**Interfaces:**
- Consumes: `assertRunsheetEditAccess`, `getRockSession`, `uploadAsset`/`fetchAsset`/`deleteAsset` from Task 2, `buildAttachmentKey`/`isAllowedAttachmentKey` from Task 1.
- Produces:
  - `POST /api/runsheet-attachments/upload` — multipart fields `file`, `channelId`, `itemId`; returns `{ key, name, size, uploadedAt }`.
  - `GET /api/runsheet-attachments/file?key=<key>&channelId=<id>[&download=1]` — streams the PDF.
  - `DELETE /api/runsheet-attachments/file?key=<key>&channelId=<id>` — returns `{ success: true, removedFromRock: boolean }`.
  - `assertAttachmentAccess(channelId: number): Promise<{ allowed: boolean; error?: string; channelName?: string }>`

- [ ] **Step 1: Write the failing access test**

```ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { deleteAsset, fetchAsset, uploadAsset } from '@/server-actions/internal/rockAssetStorage';
import { POST } from './upload/route';
import { DELETE, GET } from './file/route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));
jest.mock('@/server-actions/internal/rockAssetStorage', () => ({
  uploadAsset: jest.fn(),
  fetchAsset: jest.fn(),
  deleteAsset: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockUploadAsset = jest.mocked(uploadAsset);
const mockFetchAsset = jest.mocked(fetchAsset);
const mockDeleteAsset = jest.mocked(deleteAsset);

const KEY = 'PreacherNotes/MNL/1042/9f3c/notes.pdf';

function session(campus: 'MNL' | 'BNE', editor: boolean) {
  return {
    rolesMap: editor ? { editor: ['7001'], viewer: ['7001'] } : { viewer: ['7001'] },
    access: { runsheetCampuses: [campus] },
  } as any;
}

function pdfForm(bytes = '%PDF-1.4 hello') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'notes.pdf');
  form.append('channelId', '1');
  form.append('itemId', '1042');
  return form;
}

function uploadRequest(form: FormData) {
  return new Request('http://localhost/api/runsheet-attachments/upload', { method: 'POST', body: form });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRockGet.mockResolvedValue({ Name: 'MNL | 10AM Sunday Service', ContentChannelTypeId: 13 } as never);
  mockFetchAsset.mockResolvedValue({ body: null, contentLength: '4' } as never);
  mockDeleteAsset.mockResolvedValue(true as never);
});

describe('attachment routes reject non-editors', () => {
  it('403s a viewer on upload and never touches Rock storage', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('403s a viewer on read', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await GET(
      new Request(`http://localhost/api/runsheet-attachments/file?channelId=1&key=${encodeURIComponent(KEY)}`),
    );
    expect(response.status).toBe(403);
    expect(mockFetchAsset).not.toHaveBeenCalled();
  });

  it('403s a viewer on delete', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', false) as never);
    const response = await DELETE(
      new Request(`http://localhost/api/runsheet-attachments/file?channelId=1&key=${encodeURIComponent(KEY)}`, {
        method: 'DELETE',
      }),
    );
    expect(response.status).toBe(403);
    expect(mockDeleteAsset).not.toHaveBeenCalled();
  });

  it('403s an editor from another campus', async () => {
    mockGetRockSession.mockResolvedValue(session('BNE', true) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });
});

describe('upload validation', () => {
  it('rejects a file whose bytes are not a PDF', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await POST(uploadRequest(pdfForm('GIF89a not really a pdf')));
    expect(response.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('accepts a real PDF and returns its entry', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await POST(uploadRequest(pdfForm()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.key).toMatch(/^PreacherNotes\/MNL\/1042\//);
    expect(body.name).toBe('notes.pdf');
    expect(mockUploadAsset).toHaveBeenCalled();
  });
});

describe('key validation', () => {
  it('rejects a key outside the PreacherNotes tree', async () => {
    mockGetRockSession.mockResolvedValue(session('MNL', true) as never);
    const response = await GET(
      new Request('http://localhost/api/runsheet-attachments/file?channelId=1&key=web.config'),
    );
    expect(response.status).toBe(400);
    expect(mockFetchAsset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/runsheet-attachments/routeAccess.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Write the shared gate**

Create `src/app/api/runsheet-attachments/assertAttachmentAccess.ts`:

```ts
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { assertRunsheetEditAccess } from '@/server-actions/runsheetAuthorization';

/**
 * Attachments are editor-only, by design: a rostered viewer who can read the
 * runsheet still may not see preacher notes. Every attachment route calls this
 * before touching Rock.
 */
export async function assertAttachmentAccess(channelId: number) {
  if (!Number.isInteger(channelId) || channelId <= 0) {
    return { allowed: false as const, error: 'Invalid runsheet.' };
  }
  const session = await getRockSession();
  return assertRunsheetEditAccess(session, channelId);
}
```

- [ ] **Step 4: Write the upload route**

Create `src/app/api/runsheet-attachments/upload/route.ts`:

```ts
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
```

- [ ] **Step 5: Write the read and delete route**

Create `src/app/api/runsheet-attachments/file/route.ts`:

```ts
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
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test src/app/api/runsheet-attachments/routeAccess.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/runsheet-attachments
git commit -m "feat: add runsheet attachment upload, read and delete routes"
```

---

### Task 5: PDF viewer modal

**Files:**
- Create: `src/components/runsheet/PdfViewerModal.tsx`

**Interfaces:**
- Produces: `PdfViewerModal({ open, title, src, downloadSrc, onClose }: { open: boolean; title: string; src: string; downloadSrc: string; onClose: () => void }): JSX.Element | null`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { HiArrowDownTray, HiXMark } from 'react-icons/hi2';

/**
 * Renders one attachment inline. `src` and `downloadSrc` both point at the
 * app's own proxy route, never at the raw Rock asset URL.
 */
export default function PdfViewerModal({
  open,
  title,
  src,
  downloadSrc,
  onClose,
}: {
  open: boolean;
  title: string;
  src: string;
  downloadSrc: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">
            <a
              href={downloadSrc}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <HiArrowDownTray className="h-3.5 w-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
            >
              <HiXMark className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-slate-100">
          {/* Browsers that cannot render a PDF inline show the fallback text
              behind the frame, so the Download button stays the way out. */}
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
            This browser cannot display the PDF inline. Use Download to open it.
          </p>
          <iframe title={title} src={src} className="relative h-full w-full border-0" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. Icons come from `react-icons/hi2`, the set `RunsheetTableEditor.tsx` already imports.

- [ ] **Step 3: Commit**

```bash
git add src/components/runsheet/PdfViewerModal.tsx
git commit -m "feat: add inline PDF viewer modal with download"
```

---

### Task 6: The attachments cell

**Files:**
- Create: `src/components/runsheet/RunsheetAttachmentsCell.tsx`

**Interfaces:**
- Consumes: `parseAttachments`, `serializeAttachments`, `RunsheetAttachment` from `@/lib/runsheetAttachments`; `rockSetRunsheetItemAttachments` from Task 3; `PdfViewerModal` from Task 5.
- Produces: `RunsheetAttachmentsCell({ channelId, itemId, value, readOnly, onValueChange }: { channelId: number; itemId: number | string; value: string; readOnly: boolean; onValueChange: (next: string) => void }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { HiPaperClip, HiTrash } from 'react-icons/hi2';
import {
  parseAttachments,
  serializeAttachments,
  type RunsheetAttachment,
} from '@/lib/runsheetAttachments';
import { rockSetRunsheetItemAttachments } from '@/server-actions/rockSetRunsheetItemAttachments';
import PdfViewerModal from './PdfViewerModal';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileHref(channelId: number, key: string, download: boolean): string {
  const params = new URLSearchParams({ channelId: String(channelId), key });
  if (download) params.set('download', '1');
  return `/api/runsheet-attachments/file?${params.toString()}`;
}

/**
 * Preacher notes for one runsheet row.
 *
 * Every change persists to Rock the moment it happens — this cell never waits
 * for the grid's save button.
 */
export default function RunsheetAttachmentsCell({
  channelId,
  itemId,
  value,
  readOnly,
  onValueChange,
}: {
  channelId: number;
  itemId: number | string;
  value: string;
  readOnly: boolean;
  onValueChange: (next: string) => void;
}) {
  const attachments = useMemo(() => parseAttachments(value), [value]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<RunsheetAttachment | null>(null);

  const numericItemId = typeof itemId === 'number' ? itemId : Number.NaN;
  const savedRow = Number.isInteger(numericItemId);

  async function persist(next: RunsheetAttachment[]) {
    const result = await rockSetRunsheetItemAttachments({
      channelId,
      itemId: numericItemId,
      attachments: next,
    });
    if (!result.success) {
      setError(result.error || 'Could not save to Rock.');
      return false;
    }
    onValueChange(serializeAttachments(next));
    return true;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    let current = attachments;

    for (const file of Array.from(files)) {
      setBusy(file.name);
      const form = new FormData();
      form.append('file', file);
      form.append('channelId', String(channelId));
      form.append('itemId', String(numericItemId));

      try {
        const response = await fetch('/api/runsheet-attachments/upload', { method: 'POST', body: form });
        const body = await response.json();
        if (!response.ok) {
          setError(body?.error || `Could not upload ${file.name}.`);
          continue;
        }
        current = [...current, body as RunsheetAttachment];
        // Saved immediately, one file at a time: closing the tab now loses nothing.
        if (!(await persist(current))) return;
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        setBusy(null);
      }
    }
  }

  async function handleDelete(entry: RunsheetAttachment) {
    if (!window.confirm(`Remove "${entry.name}" from this runsheet?`)) return;
    setError(null);
    setBusy(entry.name);
    try {
      await fetch(fileHref(channelId, entry.key, false), { method: 'DELETE' });
      await persist(attachments.filter((item) => item.key !== entry.key));
    } finally {
      setBusy(null);
    }
  }

  if (readOnly) return <span className="block px-1 text-xs text-slate-400">&mdash;</span>;

  return (
    <div className="px-1 py-0.5 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        title={attachments.length ? `${attachments.length} attached` : 'Attach preacher notes'}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
          attachments.length ? 'text-blue-700 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-100'
        }`}
      >
        <HiPaperClip className="h-3.5 w-3.5" />
        {attachments.length > 0 && <span className="font-semibold">{attachments.length}</span>}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 rounded border border-slate-200 bg-white p-1.5 text-left">
          {!savedRow && <p className="text-[11px] text-amber-700">Save this row before attaching files.</p>}

          {attachments.map((entry) => (
            <div key={entry.key} className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewing(entry)}
                className="truncate text-left text-blue-700 hover:underline"
              >
                {entry.name}
              </button>
              <span className="shrink-0 text-[11px] text-slate-400">{formatSize(entry.size)}</span>
              <button
                type="button"
                onClick={() => handleDelete(entry)}
                aria-label={`Delete ${entry.name}`}
                className="shrink-0 text-rose-600 hover:text-rose-700"
              >
                <HiTrash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {savedRow && (
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
              className="block w-full text-[11px]"
            />
          )}

          {busy && <p className="text-[11px] text-slate-500">Uploading {busy}…</p>}
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
      )}

      <PdfViewerModal
        open={Boolean(viewing)}
        title={viewing?.name || ''}
        src={viewing ? fileHref(channelId, viewing.key, false) : ''}
        downloadSrc={viewing ? fileHref(channelId, viewing.key, true) : ''}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/runsheet/RunsheetAttachmentsCell.tsx
git commit -m "feat: add per-row preacher notes attachment cell"
```

---

### Task 7: Wire the cell into the grid

The `PREACHERNOTES` column arrives through the existing runtime attribute discovery, so it is already in `dynamicAttrCols`. Three changes: render it as the attachments cell instead of a rich-text cell, hide it from non-editors, and keep it out of the grid's own save diff — attachments persist on their own, and letting the bulk save write the same attribute would clobber a fresh upload with stale row state.

**Files:**
- Modify: `src/components/runsheet/RunsheetTableEditor.tsx` (the `dynamicAttrCols` memo near line 818, the row cell map near line 2777, and the header map near line 2627)

**Interfaces:**
- Consumes: `RunsheetAttachmentsCell` (Task 6), `PREACHER_NOTES_ATTRIBUTE_KEY` (Task 1).

- [ ] **Step 1: Import the new pieces**

Add near the other component imports at the top of `RunsheetTableEditor.tsx`:

```tsx
import { PREACHER_NOTES_ATTRIBUTE_KEY } from '@/lib/runsheetAttachments';
import RunsheetAttachmentsCell from './RunsheetAttachmentsCell';
```

- [ ] **Step 2: Hide the column from non-editors**

In the `dynamicAttrCols` memo (around line 818), filter the column out when the grid is read-only, so a viewer never sees the paperclip:

```tsx
// Attachments are editor-only; a viewer must not even see the column.
const visibleCols = readOnly
  ? cols.filter((col) => col.key !== PREACHER_NOTES_ATTRIBUTE_KEY)
  : cols;
```

Return `visibleCols` from the memo, and add `readOnly` to its dependency array.

- [ ] **Step 3: Render the attachments cell for that column**

In the row-level `dynamicAttrCols.map((col) => …)` (around line 2777), branch before the normal cell:

```tsx
{dynamicAttrCols.map((col) => {
  if (col.key === PREACHER_NOTES_ATTRIBUTE_KEY) {
    return (
      <td
        key={col.id}
        className="border-r border-slate-200 p-0 align-middle text-center"
        style={getColumnStyle(col.key, col.name)}
      >
        <RunsheetAttachmentsCell
          channelId={channelId}
          itemId={item.id}
          value={readRunsheetCellValue(item, col.key)}
          readOnly={readOnly}
          onValueChange={(next) => {
            // Mirror Rock into local state without marking the row dirty:
            // the attachment list is already saved.
            setItems((rows) =>
              rows.map((row) =>
                row.id === item.id
                  ? { ...row, attributeValues: { ...row.attributeValues, [col.key]: next } }
                  : row,
              ),
            );
          }}
        />
      </td>
    );
  }

  // …existing cell rendering, unchanged…
})}
```

The row state setter is `setItems`, declared around line 244 as `const [items, setItems] = useState<RunsheetItemRow[]>(…)`.

- [ ] **Step 4: Keep the column out of the grid's save diff**

Find `computeDiffPayload` and `createRowFingerprint` (declared around line 435) and exclude the attribute key from both, so an attachment change never marks a row dirty and a bulk save never writes this attribute:

```tsx
// Attachments save themselves through their own server action; including them
// here would let a stale row overwrite a just-uploaded file list.
const savableColumns = dynamicAttrCols.filter((col) => col.key !== PREACHER_NOTES_ATTRIBUTE_KEY);
```

Use `savableColumns` wherever the save payload and fingerprint iterate the columns.

- [ ] **Step 5: Verify by hand against a real runsheet**

Run: `pnpm dev`, open a runsheet on a channel that has the `PREACHERNOTES` attribute, and confirm each of:
- The paperclip appears for an editor and the column is absent for a viewer.
- Attaching a PDF shows the progress line, then the count badge increments.
- Reloading the page without pressing the grid's save button still shows the file — this is the "instantly saved in Rock" requirement.
- Clicking the filename opens the modal and the PDF renders; Download saves it.
- Deleting removes it from the list and it stays gone after a reload.
- Attaching a non-PDF is refused with a visible message.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/runsheet/RunsheetTableEditor.tsx
git commit -m "feat: render preacher notes attachments column in the runsheet grid"
```

---

### Task 8: Rock setup, docs and version bump

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Create the Rock folders**

In Rock at `https://rock.favor.church/admin/cms/asset-manager`, under the `Local Content` provider, create `PreacherNotes/` and inside it `MNL/`, `BNE/`, `SEL/` and `ALL/`. Uploads create a missing folder on demand, so this is a convenience for browsing rather than a hard requirement.

- [ ] **Step 2: Add the Rock attribute**

For each content channel that should have preacher notes, add an item attribute with key `PREACHERNOTES`, name `Preacher Notes`, field type `Text`. No deploy is needed to enable a further channel later.

- [ ] **Step 3: Document it in the README**

Add this section under "Cell formatting":

```markdown
## Preacher notes (PDF attachments)

A channel gets an attachments column by having a `PREACHERNOTES` item attribute
(field type Text) in Rock. The value is a JSON array of
`{key, name, size, uploadedAt}`, where `key` is an Asset Manager key under
`PreacherNotes/<CAMPUS>/<itemId>/<random>/<file>.pdf` on the `Local Content`
provider.

Attachments are **editor-only**: a rostered viewer who can read the runsheet
does not see the column and is refused by the routes. PDFs are uploaded, viewed
and deleted through `/api/runsheet-attachments/*`, which proxies Rock so the raw
asset URL is never rendered in the page. Note that asset URLs are public to
anyone who holds them — see the design spec for the accepted risk.

Each upload and delete saves to Rock immediately and does not depend on the
grid's save button.
```

- [ ] **Step 4: Bump the version**

Per `AGENTS.md`, set `"version": "1.21.0"` in `package.json` — a minor bump for a backwards-compatible feature.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json
git commit -m "docs: document preacher notes attachments and bump to 1.21.0"
```
