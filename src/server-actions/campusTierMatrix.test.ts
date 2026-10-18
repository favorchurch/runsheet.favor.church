/**
 * Campus tier matrix: every runsheet tier (campus editors, a Global editor and
 * Global view-only staff) against an MNL, BNE and SEL runsheet, across every
 * read and write entry point. Only the Rock and Auth0 boundaries are mocked,
 * so the real access gates decide each cell.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { renderRunsheetPdf } from '@/lib/runsheetExport';
import type { RunsheetCampusCode } from '@/lib/runsheetCampus';
import { uploadRockContent } from '@/server-actions/internal/rockContentUpload';
import { rockDelete, rockGet, rockPatch, rockPost, rockPut } from '@/server-actions/internal/rockFetch';
import {
  getPreacherNotesAttributeValue,
  setPreacherNotesAttributeValue,
} from '@/server-actions/internal/rockPreacherNotesAttribute';
import { GET as exportRunsheet } from '@/app/api/runsheet-export/[channelId]/route';
import { POST as uploadPreacherNote } from '@/app/api/runsheet-notes/upload/route';
import { rockBulkSaveRunsheetItems } from './rockBulkSaveRunsheetItems';
import { rockCreateServiceRunsheet } from './rockCreateServiceRunsheet';
import { rockDeleteServiceRunsheet } from './rockDeleteServiceRunsheet';
import { rockDuplicateServiceRunsheet } from './rockDuplicateServiceRunsheet';
import { rockEnsureRunsheetTemplate } from './rockEnsureRunsheetTemplate';
import { rockGetRunsheetDetails } from './rockGetRunsheetDetails';
import { rockGetRunsheetDetailsBatch } from './rockGetRunsheetDetailsBatch';
import { rockGetPreacherNotes, rockUnlinkPreacherNote } from './rockPreacherNotes';
import { rockSyncRosterRole } from './rockSyncRosterRole';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockDelete: jest.fn(),
  rockGet: jest.fn(),
  rockPatch: jest.fn(),
  rockPost: jest.fn(),
  rockPut: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockContentUpload', () => ({
  fetchRockContent: jest.fn(),
  uploadRockContent: jest.fn(),
  RockContentExistsError: class RockContentExistsError extends Error {},
}));

jest.mock('@/server-actions/internal/rockPreacherNotesAttribute', () => ({
  getPreacherNotesAttributeValue: jest.fn(),
  setPreacherNotesAttributeValue: jest.fn(),
  mutatePreacherNotesAttribute: jest.fn(async (channelId: number, mutate: any) => {
    const attr = jest.requireMock('@/server-actions/internal/rockPreacherNotesAttribute') as any;
    return attr.setPreacherNotesAttributeValue(channelId, await mutate(await attr.getPreacherNotesAttributeValue(channelId)));
  }),
}));

jest.mock('@/lib/runsheetExport', () => {
  const actual = jest.requireActual<typeof import('@/lib/runsheetExport')>('@/lib/runsheetExport');
  return { ...actual, renderRunsheetPdf: jest.fn() };
});

jest.mock('@/server-actions/rockGetRosterAssignments', () => ({
  rockGetRosterAssignments: jest.fn(async () => null),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);
const mockRockPatch = jest.mocked(rockPatch);
const mockRockPut = jest.mocked(rockPut);
const mockRockDelete = jest.mocked(rockDelete);
const mockUpload = jest.mocked(uploadRockContent);
const mockGetNotes = jest.mocked(getPreacherNotesAttributeValue);
const mockSetNotes = jest.mocked(setPreacherNotesAttributeValue);
const mockRender = jest.mocked(renderRunsheetPdf);

const CHANNEL_ID = 42;
const CAMPUSES: RunsheetCampusCode[] = ['MNL', 'BNE', 'SEL'];

const EDIT_DENIAL = 'Unauthorized: Only runsheet editors can perform this action.';
const CAMPUS_DENIAL = 'You are not authorized for this runsheet campus.';
const EDIT_NOT_FOUND = 'This runsheet no longer exists. It may have been deleted already.';

type Tier = { label: string; view: string[]; edit: string[]; session: unknown };

function campusEditor(campus: RunsheetCampusCode): Tier {
  return {
    label: `${campus} editor`,
    view: [campus],
    edit: [campus],
    session: {
      rolesMap: { editor: ['7001'], viewer: ['7001'] },
      access: { runsheetCampuses: [campus], runsheetEditCampuses: [campus] },
    },
  };
}

const TIERS: Tier[] = [
  ...CAMPUSES.map(campusEditor),
  {
    label: 'Global editor',
    view: CAMPUSES,
    edit: CAMPUSES,
    session: {
      rolesMap: { editor: ['10'], viewer: ['10'] },
      access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] },
    },
  },
  {
    label: 'GLB view-only',
    view: CAMPUSES,
    edit: [],
    session: {
      rolesMap: { viewer: ['103375'] },
      access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: [] },
    },
  },
];

const channelName = (campus: RunsheetCampusCode) => `${campus} Service // August 16, 2099 // 10AM`;

/** Rock as seen through the REST boundary: channel 42 belongs to `campus`. */
function routeRock(campus: RunsheetCampusCode | 'missing') {
  mockRockGet.mockImplementation((async (url: string) => {
    if (url === `/ContentChannels/${CHANNEL_ID}`) {
      if (campus === 'missing') throw new Error('Rock API error: 404 ');
      return { Id: CHANNEL_ID, Name: channelName(campus), ContentChannelTypeId: 13, ItemsManuallyOrdered: true };
    }
    // The template lookup finds an existing master template.
    if (url === '/ContentChannels') return [{ Id: 77 }];
    return [];
  }) as any);
}

function expectNoRockWrites() {
  expect(mockRockPost).not.toHaveBeenCalled();
  expect(mockRockPatch).not.toHaveBeenCalled();
  expect(mockRockPut).not.toHaveBeenCalled();
  expect(mockRockDelete).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockSetNotes).not.toHaveBeenCalled();
}

async function exportStatus() {
  const response = await exportRunsheet(new Request(`http://localhost/api/runsheet-export/${CHANNEL_ID}`), {
    params: Promise.resolve({ channelId: String(CHANNEL_ID) }),
  });
  return { status: response.status, body: response.status === 200 ? '' : await response.text() };
}

function uploadRequest() {
  const formData = new FormData();
  formData.append('file', new File([new Blob(['%PDF-1.4 notes'])], 'notes.pdf', { type: 'application/pdf' }));
  return new Request(`http://localhost/api/runsheet-notes/upload?channelId=${CHANNEL_ID}`, {
    method: 'POST',
    body: formData,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRockPost.mockResolvedValue(123);
  mockRockPatch.mockResolvedValue(null);
  mockRockPut.mockResolvedValue(null);
  mockRockDelete.mockResolvedValue(null);
  mockGetNotes.mockResolvedValue([]);
  mockSetNotes.mockImplementation(async (_id, notes) => notes as any);
  mockUpload.mockImplementation(async (folder, _file, name) => `${folder}${name}`);
  mockRender.mockResolvedValue(Buffer.from('%PDF-1.4'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe.each(TIERS)('$label', (tier) => {
  beforeEach(() => {
    mockGetRockSession.mockResolvedValue(tier.session as any);
  });

  describe.each(CAMPUSES)('on a %s runsheet', (campus) => {
    const canView = tier.view.includes(campus);
    const canEdit = tier.edit.includes(campus);
    // A session without the editor role is refused before any channel lookup.
    const isEditor = 'editor' in (tier.session as { rolesMap: object }).rolesMap;

    beforeEach(() => routeRock(campus));

    it(`${canView ? 'reads' : 'is denied'} detail, batch and export`, async () => {
      const detail = await rockGetRunsheetDetails(CHANNEL_ID);
      const [batch] = await rockGetRunsheetDetailsBatch([CHANNEL_ID]);
      const exported = await exportStatus();

      if (canView) {
        expect(detail.success).toBe(true);
        expect(batch.success).toBe(true);
        expect(exported.status).toBe(200);
        return;
      }

      // Byte-identical to a missing id, with no name, campus or content.
      routeRock('missing');
      expect(detail).toEqual(await rockGetRunsheetDetails(CHANNEL_ID));
      expect(batch).toEqual((await rockGetRunsheetDetailsBatch([CHANNEL_ID]))[0]);
      expect(exported).toEqual(await exportStatus());
      expect(detail).toEqual({ success: false, error: 'Runsheet not found.' });
      expect(exported).toEqual({ status: 404, body: JSON.stringify({ error: 'Runsheet not found.' }) });
    });

    it(`${canEdit ? 'may' : 'may not'} create, duplicate or ensure the template`, async () => {
      const results = [
        await rockCreateServiceRunsheet(channelName(campus), 13),
        await rockDuplicateServiceRunsheet(channelName(campus)),
        await rockEnsureRunsheetTemplate(campus),
      ];

      if (canEdit) {
        for (const result of results) expect(result.success).toBe(true);
        return;
      }
      const titleDenial = isEditor ? CAMPUS_DENIAL : EDIT_DENIAL;
      for (const result of results) expect(result).toEqual({ success: false, error: titleDenial });
      expectNoRockWrites();
    });

    it(`${canEdit ? 'may' : 'may not'} bulk save, sync a roster role or touch preacher notes`, async () => {
      const save = await rockBulkSaveRunsheetItems(CHANNEL_ID, [], []);
      const roster = await rockSyncRosterRole({ channelName: channelName(campus), roleTitle: 'Roster: Service Director', personIds: [] });
      const notes = await rockGetPreacherNotes(CHANNEL_ID);
      const unlink = await rockUnlinkPreacherNote(CHANNEL_ID, `PreacherNotes/${campus}/notes.pdf`);
      const upload = await uploadPreacherNote(uploadRequest());

      if (canEdit) {
        expect(save.success).toBe(true);
        // Past the gate, the sync reaches Rock's own checks: only MNL is
        // Rock-linked, and the mocked Rock has no matching service for it.
        expect(roster).toEqual({
          success: false,
          people: [],
          error: campus === 'MNL' ? 'This runsheet does not match a Rock service.' : 'This role is not linked to Rock.',
        });
        expect(notes.success).toBe(true);
        expect(unlink.success).toBe(true);
        expect(upload.status).toBe(200);
        return;
      }

      // Id-based writes on a runsheet outside the view scope read as missing;
      // a viewable runsheet keeps the campus/editor denial.
      const idDenial = !isEditor ? EDIT_DENIAL : canView ? CAMPUS_DENIAL : EDIT_NOT_FOUND;
      const titleDenial = isEditor ? CAMPUS_DENIAL : EDIT_DENIAL;
      expect(save.error).toBe(idDenial);
      expect(roster.error).toBe(titleDenial);
      expect(notes.error).toBe(idDenial);
      expect(unlink.error).toBe(idDenial);
      expect(upload.status).toBe(403);
      expect((await upload.json()).error).toBe(idDenial);
      expectNoRockWrites();

      if (idDenial === EDIT_NOT_FOUND) {
        routeRock('missing');
        expect(save).toEqual(await rockBulkSaveRunsheetItems(CHANNEL_ID, [], []));
        expect(notes).toEqual(await rockGetPreacherNotes(CHANNEL_ID));
      }
    });

    it(`${canEdit ? 'deletes' : 'deletes nothing'}`, async () => {
      const result = await rockDeleteServiceRunsheet(CHANNEL_ID);

      if (canEdit) {
        expect(result).toEqual({ success: true });
        expect(mockRockDelete).toHaveBeenCalledWith(`/ContentChannels/${CHANNEL_ID}`, undefined, [404]);
        return;
      }

      expectNoRockWrites();
      expect(mockRockGet).not.toHaveBeenCalledWith('/ContentChannelItems', expect.anything(), true);
      if (canView) {
        expect(result).toEqual({ success: false, error: isEditor ? CAMPUS_DENIAL : EDIT_DENIAL });
      } else {
        // Exactly what a missing id returns.
        routeRock('missing');
        expect(result).toEqual(await rockDeleteServiceRunsheet(CHANNEL_ID));
        expectNoRockWrites();
      }
    });
  });
});

describe('Global view-only staff', () => {
  it('views every campus and is denied every write', async () => {
    const glb = TIERS.find((tier) => tier.label === 'GLB view-only')!;
    mockGetRockSession.mockResolvedValue(glb.session as any);

    for (const campus of CAMPUSES) {
      routeRock(campus);
      expect((await rockGetRunsheetDetails(CHANNEL_ID)).success).toBe(true);

      const writes = [
        await rockCreateServiceRunsheet(channelName(campus), 13),
        await rockDuplicateServiceRunsheet(channelName(campus)),
        await rockDeleteServiceRunsheet(CHANNEL_ID),
        await rockBulkSaveRunsheetItems(CHANNEL_ID, [], []),
        await rockEnsureRunsheetTemplate(campus),
        await rockSyncRosterRole({ channelName: channelName(campus), roleTitle: 'Roster: Service Director', personIds: [] }),
        await rockGetPreacherNotes(CHANNEL_ID),
        await rockUnlinkPreacherNote(CHANNEL_ID, `PreacherNotes/${campus}/notes.pdf`),
      ];
      for (const result of writes) expect(result).toMatchObject({ success: false, error: EDIT_DENIAL });
      expect((await uploadPreacherNote(uploadRequest())).status).toBe(403);
    }
    expectNoRockWrites();
  });
});
