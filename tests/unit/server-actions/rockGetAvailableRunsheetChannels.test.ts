import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn() }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockGet: jest.fn() }));

describe('rockGetAvailableRunsheetChannels', () => {
  it('never lists master template channels, even for all-campus users', async () => {
    jest.mocked(getRockSession).mockResolvedValue({
      rolesMap: { editor: ['editor-1'] },
      access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] },
    } as any);
    jest.mocked(rockGet).mockResolvedValue([
      { Id: 1, Name: 'MNL Crowne // October 4, 2099 // 10AM' },
      { Id: 2, Name: 'MNL // Runsheet Master Template' },
      { Id: 3, Name: 'Runsheet Master Template' },
    ]);

    const res = await rockGetAvailableRunsheetChannels(false);

    expect(res.success).toBe(true);
    expect(res.channels.map((c) => c.id)).toEqual([1]);
  });
});

describe('rockGetAvailableRunsheetChannels campus scoping', () => {
  const CHANNELS = [
    { Id: 11, Name: 'MNL Crowne // October 4, 2099 // 10AM' },
    { Id: 12, Name: 'BNE Service // October 4, 2099 // 10AM' },
    { Id: 13, Name: 'SEL Service // October 4, 2099 // 11AM' },
    { Id: 21, Name: 'MNL Crowne // October 4, 2020 // 10AM' },
    { Id: 22, Name: 'BNE Service // October 4, 2020 // 10AM' },
    { Id: 23, Name: 'SEL Service // October 4, 2020 // 11AM' },
    { Id: 31, Name: 'MNL Grow - Bible Essentials // September 29, 2020 // 7PM' },
  ];

  const campusUser = (view: string[], edit: string[]) => ({
    rolesMap: { editor: ['editor-1'] },
    access: { runsheetCampuses: view, runsheetEditCampuses: edit },
  });
  const PERSONAS: Record<string, any> = {
    MNL: campusUser(['MNL'], ['MNL']),
    BNE: campusUser(['BNE'], ['BNE']),
    SEL: campusUser(['SEL'], ['SEL']),
    Global: campusUser(['ALL'], ['ALL']),
    'GLB view-only': { rolesMap: { viewer: ['viewer-1'] }, access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: [] } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(rockGet).mockImplementation(async (url: string) =>
      (url === '/Schedules'
        ? [{ Id: 477, Name: 'MNL Grow - Bible Essentials', iCalendarContent: '' }]
        : CHANNELS) as any,
    );
  });

  async function idsFor(session: any, includeArchived: boolean): Promise<number[]> {
    jest.mocked(getRockSession).mockResolvedValue(session);
    const res = await rockGetAvailableRunsheetChannels(includeArchived);
    expect(res.success).toBe(true);
    return res.channels.map((c) => c.id).sort((a, b) => a - b);
  }

  it.each([
    // Grow titles are MNL-marked, so MNL editors hold them by campus.
    ['MNL', [11, 21, 31]],
    ['BNE', [12, 22]],
    ['SEL', [13, 23]],
    ['Global', [11, 12, 13, 21, 22, 23, 31]],
    ['GLB view-only', [11, 12, 13]],
  ])('%s user with archived requested gets their campus, past runsheets only where they edit', async (persona, expected) => {
    expect(await idsFor(PERSONAS[persona], true)).toEqual(expected);
  });

  it.each([
    ['MNL', [11]],
    ['BNE', [12]],
    ['SEL', [13]],
    ['Global', [11, 12, 13]],
    ['GLB view-only', [11, 12, 13]],
  ])('%s user gets only upcoming runsheets without asking for archived', async (persona, expected) => {
    expect(await idsFor(PERSONAS[persona], false)).toEqual(expected);
  });

  it('keeps past runsheets of a view-only campus out of an editor\'s archive', async () => {
    // Edits MNL, only views BNE: the BNE past runsheet is not theirs to reopen.
    expect(await idsFor(campusUser(['MNL', 'BNE'], ['MNL']), true)).toEqual([11, 12, 21, 31]);
  });

  it('lists past Grow runsheets for a Grow editor, but not for a Grow viewer', async () => {
    expect(
      await idsFor({ rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } }, true),
    ).toEqual([31]);
    expect(
      await idsFor(
        { rolesMap: { growViewer: ['477:2020-09-29'] }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } },
        true,
      ),
    ).toEqual([]);
  });
});
