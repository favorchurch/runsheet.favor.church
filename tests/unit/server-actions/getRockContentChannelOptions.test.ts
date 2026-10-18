import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

const mockSession = jest.mocked(getRockSession);

const CATEGORIES = [
  { Id: 336, Name: 'MNL | Sunday Service' },
  { Id: 436, Name: 'BNE | Sunday Service' },
  { Id: 536, Name: 'SEL | Sunday Service' },
  { Id: 590, Name: 'MNL | ALL EVENTS' },
  { Id: 700, Name: 'Special Services' },
  { Id: 1, Name: 'External Website' },
  { Id: 2, Name: 'Internal' },
];

const campusUser = (...campuses: string[]) => ({
  rolesMap: { editor: ['7001'] },
  access: { runsheetCampuses: campuses, runsheetEditCampuses: campuses },
});
const PERSONAS: Record<string, any> = {
  MNL: campusUser('MNL'),
  BNE: campusUser('BNE'),
  SEL: campusUser('SEL'),
  Global: { rolesMap: { editor: ['7001'] }, access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] } },
  'GLB view-only': { rolesMap: { viewer: ['7002'] }, access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: [] } },
};

async function categoryIdsFor(session: any): Promise<number[]> {
  mockSession.mockResolvedValue(session);
  const res = await getRockContentChannelOptions();
  expect(res.success).toBe(true);
  return res.categories.map((c) => c.id);
}

describe('getRockContentChannelOptions campus scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(rockGet).mockImplementation(async (url: string) =>
      (url.startsWith('/ContentChannelTypes') ? [{ Id: 13, Name: 'Service Runsheet' }] : CATEGORIES) as any,
    );
  });

  it.each([
    ['MNL', [336, 590, 700]],
    ['BNE', [436, 700]],
    ['SEL', [536, 700]],
    ['Global', [336, 436, 536, 590, 700]],
    ['GLB view-only', [336, 436, 536, 590, 700]],
  ])('%s user gets only categories for their campuses, plus unmarked ones', async (persona, expected) => {
    expect(await categoryIdsFor(PERSONAS[persona])).toEqual(expected);
  });

  it('lists a user holding two campuses both campuses\' categories', async () => {
    expect(await categoryIdsFor(campusUser('MNL', 'BNE'))).toEqual([336, 436, 590, 700]);
  });

  it('gives a Grow-only editor just the Grow content category', async () => {
    expect(
      await categoryIdsFor({ rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } }),
    ).toEqual([590]);
  });

  it('keeps the Grow category for a BNE user who is also a Grow editor', async () => {
    expect(
      await categoryIdsFor({
        rolesMap: { editor: ['7001'], growEditor: ['19108'] },
        access: { runsheetCampuses: ['BNE'], runsheetEditCampuses: ['BNE'] },
      }),
    ).toEqual([436, 590, 700]);
  });

  it('gives a campus-less viewer (rostered or Grow viewer) no categories', async () => {
    expect(
      await categoryIdsFor({ rolesMap: { growViewer: ['477:2026-09-29'] }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } }),
    ).toEqual([]);
  });

  it('denies a session with no runsheet access before calling Rock', async () => {
    mockSession.mockResolvedValue({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);
    const res = await getRockContentChannelOptions();
    expect(res).toMatchObject({ success: false, categories: [] });
    expect(rockGet).not.toHaveBeenCalled();
  });
});
