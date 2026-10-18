import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';

jest.mock('@/auth0-hooks/server/getRockSession');
jest.mock('@/server-actions/internal/rockFetch');

const mockGetRockSession = getRockSession as jest.MockedFunction<typeof getRockSession>;
const mockRockGet = rockGet as jest.MockedFunction<typeof rockGet>;

const SCHEDULE_CATEGORIES = [
  // 50 SUNDAY SERVICES
  { Id: 50, ParentCategoryId: null },
  { Id: 302, ParentCategoryId: 50 }, // MNL
  { Id: 303, ParentCategoryId: 50 }, // BNE
  { Id: 304, ParentCategoryId: 50 }, // SEL
  { Id: 417, ParentCategoryId: 302 }, // Crowne
  { Id: 416, ParentCategoryId: 302 }, // Podium
  // 171 ALL EVENTS
  { Id: 171, ParentCategoryId: null },
  { Id: 305, ParentCategoryId: 171 }, // MNL
  { Id: 306, ParentCategoryId: 171 }, // BNE
  { Id: 307, ParentCategoryId: 171 }, // SEL
  { Id: 481, ParentCategoryId: 305 }, // One-off
  // 475 YOUTH SERVICES
  { Id: 475, ParentCategoryId: null },
  { Id: 479, ParentCategoryId: 475 }, // MNL
  { Id: 478, ParentCategoryId: 475 }, // BNE
  { Id: 480, ParentCategoryId: 475 }, // SEL
  // 470 KIDS SERVICES
  { Id: 470, ParentCategoryId: null },
  { Id: 472, ParentCategoryId: 470 }, // MNL
  { Id: 471, ParentCategoryId: 470 }, // BNE
  { Id: 473, ParentCategoryId: 470 }, // SEL
  { Id: 476, ParentCategoryId: 472 }, // MNL Crowne
  // Grow Courses
  { Id: 483, ParentCategoryId: 305 },
];

const WEEKLY_SUNDAY = (time: string) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260816T${time}\r\nRRULE:FREQ=WEEKLY;UNTIL=20991221T000000;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR`;

const KIDS_MANILA_SCHEDULES = [
  { Id: 566, Name: 'MNL Crowne 9AM - Kids', CategoryId: 476, iCalendarContent: WEEKLY_SUNDAY('090000') },
  { Id: 559, Name: 'MNL Crowne 11:30AM - Kids', CategoryId: 476, iCalendarContent: WEEKLY_SUNDAY('113000') },
];

const SUNDAY_CROWNE_SCHEDULES = [
  {
    Id: 564,
    Name: 'MNL Crowne 9AM',
    CategoryId: 417,
    iCalendarContent:
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260816T090000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261221T000000;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR',
    EffectiveStartDate: '2026-08-16T00:00:00+08:00',
    EffectiveEndDate: '2026-12-21T00:00:00+08:00',
  },
  {
    Id: 557,
    Name: 'MNL Crowne 11:30AM',
    CategoryId: 417,
    iCalendarContent:
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260816T113000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261221T000000;BYDAY=SU\r\nEND:VEVENT\r\nEND:VCALENDAR',
    EffectiveStartDate: '2026-08-16T00:00:00+08:00',
    EffectiveEndDate: '2026-12-21T00:00:00+08:00',
  },
];

const YOUTH_MANILA_SCHEDULES = [
  {
    Id: 106,
    Name: 'MNL 1PM Saturday Youth',
    CategoryId: 479,
    iCalendarContent:
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260516T130000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261205T000000;BYDAY=SA\r\nEND:VEVENT\r\nEND:VCALENDAR',
    EffectiveStartDate: '2026-05-16T00:00:00+08:00',
    EffectiveEndDate: '2026-12-05T00:00:00+08:00',
  },
  {
    Id: 107,
    Name: 'MNL 4PM Saturday Youth',
    CategoryId: 479,
    iCalendarContent:
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260516T160000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261205T000000;BYDAY=SA\r\nEND:VEVENT\r\nEND:VCALENDAR',
    EffectiveStartDate: '2026-05-16T00:00:00+08:00',
    EffectiveEndDate: '2026-12-05T00:00:00+08:00',
  },
];

describe('rockGetScheduleOptions - Sunday services schedule resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue({
      // Global: these cases cover tree resolution, including the top-level
      // trees (50, 475) only Global may query.
      rolesMap: { editor: ['true'] },
      access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] },
    } as any);
  });

  it('queries Category 50 tree (and Manila subcategories like 417) when category is MNL Sunday Service (336)', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/336') {
        return { Id: 336, Name: 'MNL | Sunday Service' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return SUNDAY_CROWNE_SCHEDULES as any;
      }
      return null;
    });

    const res = await rockGetScheduleOptions(336, '2026-10-04');

    expect(res.success).toBe(true);
    // Captured filter must include Sunday category 417 and 302, NOT 305
    expect(capturedFilter).toContain('CategoryId eq 417');
    expect(capturedFilter).toContain('CategoryId eq 302');
    expect(capturedFilter).not.toContain('CategoryId eq 305');

    // Schedules returned
    expect(res.schedules).toHaveLength(2);
    expect(res.schedules[0].name).toBe('MNL Crowne 9AM');
    expect(res.schedules[0].timeLabel).toBe('9AM');
    expect(res.schedules[1].name).toBe('MNL Crowne 11:30AM');
    expect(res.schedules[1].timeLabel).toBe('11:30AM');
  });

  it('queries Category 50 tree when categoryId is 50 directly (SUNDAY SERVICES)', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/50') {
        return { Id: 50, Name: 'SUNDAY SERVICES' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return SUNDAY_CROWNE_SCHEDULES as any;
      }
      return null;
    });

    const res = await rockGetScheduleOptions(50, '2026-10-04');

    expect(res.success).toBe(true);
    expect(capturedFilter).toContain('CategoryId eq 50');
    expect(capturedFilter).toContain('CategoryId eq 417');
    expect(res.schedules.length).toBeGreaterThan(0);
  });

  it('queries Event category 305 when category is MNL Family Night (337)', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/337') {
        return { Id: 337, Name: 'MNL | Family Night' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return [] as any;
      }
      return null;
    });

    await rockGetScheduleOptions(337, '2026-10-04');

    expect(capturedFilter).toContain('CategoryId eq 305');
    expect(capturedFilter).not.toContain('CategoryId eq 417');
  });

  it('queries Category 475 tree when categoryId is 475 directly (YOUTH SERVICES)', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/475') {
        return { Id: 475, Name: 'YOUTH SERVICES' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return YOUTH_MANILA_SCHEDULES as any;
      }
      return null;
    });

    const res = await rockGetScheduleOptions(475);

    expect(res.success).toBe(true);
    expect(capturedFilter).toContain('CategoryId eq 475');
    expect(capturedFilter).toContain('CategoryId eq 479');
    expect(res.schedules.length).toBeGreaterThan(0);
    expect(res.schedules[0].name).toBe('MNL 1PM Saturday Youth');
    expect(res.schedules[0].nextDate).toBeDefined();
  });

  it('queries Category 479 when category is MNL Youth Service (341) and preserves youth schedules even if form date is Sunday', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/341') {
        return { Id: 341, Name: 'MNL | Youth Service' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return YOUTH_MANILA_SCHEDULES as any;
      }
      return null;
    });

    // Form starts with Sunday date (e.g. 2026-10-04), but youth services run on Saturday
    const res = await rockGetScheduleOptions(341, '2026-10-04');

    expect(res.success).toBe(true);
    expect(capturedFilter).toContain('CategoryId eq 479');
    expect(res.schedules).toHaveLength(2);
    expect(res.schedules[0].name).toBe('MNL 1PM Saturday Youth');
    expect(res.schedules[0].nextDate).toBeDefined();
  });

  it('recognizes child category 479 directly as youth even without "youth" in its name', async () => {
    let capturedFilter = '';
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') {
        return SCHEDULE_CATEGORIES as any;
      }
      if (url === '/Categories/479') {
        return { Id: 479, Name: '🇵🇭 Manila' } as any;
      }
      if (url === '/Schedules') {
        capturedFilter = params?.$filter || '';
        return YOUTH_MANILA_SCHEDULES as any;
      }
      return null;
    });

    const res = await rockGetScheduleOptions(479);

    expect(res.success).toBe(true);
    expect(capturedFilter).toContain('CategoryId eq 479');
    expect(res.schedules).toHaveLength(2);
    expect(res.schedules[0].name).toBe('MNL 1PM Saturday Youth');
  });
});

describe('rockGetScheduleOptions - Kids and ALL EVENTS categories', () => {
  const editor = { rolesMap: { editor: ['true'] }, access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: ['MNL'] } } as any;
  const growOnly = { rolesMap: { growEditor: ['19108'] }, contact: { campusId: 1 }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } } as any;

  function route(categoryId: number, categoryName: string, schedules: any[]) {
    const filters: string[] = [];
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') return SCHEDULE_CATEGORIES as any;
      if (url === `/Categories/${categoryId}`) return { Id: categoryId, Name: categoryName } as any;
      if (url === '/Schedules') {
        filters.push(params?.$filter || '');
        return schedules as any;
      }
      return null;
    });
    return filters;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(editor);
  });

  it('lists Manila Kids schedules for MNL | Kids Service (586)', async () => {
    const filters = route(586, 'MNL | Kids Service', KIDS_MANILA_SCHEDULES);

    const res = await rockGetScheduleOptions(586, '2026-10-04');

    expect(filters[0]).toContain('CategoryId eq 472');
    expect(filters[0]).toContain('CategoryId eq 476');
    expect(filters[0]).not.toContain('CategoryId eq 302');
    expect(res.schedules.map((s) => s.name)).toEqual(['MNL Crowne 9AM - Kids', 'MNL Crowne 11:30AM - Kids']);
  });

  it('keeps Kids schedules out of a Sunday Service list', async () => {
    route(336, 'MNL | Sunday Service', [...SUNDAY_CROWNE_SCHEDULES, ...KIDS_MANILA_SCHEDULES]);

    const res = await rockGetScheduleOptions(336, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['MNL Crowne 9AM', 'MNL Crowne 11:30AM']);
  });

  it('gives a full editor the whole Manila events tree for MNL | ALL EVENTS (590)', async () => {
    const filters = route(590, 'MNL | ALL EVENTS', []);

    await rockGetScheduleOptions(590, '2026-10-04');

    expect(filters[0]).toContain('IsActive eq true and (');
    expect(filters[0]).toContain('CategoryId eq 305');
    expect(filters[0]).toContain('CategoryId eq 481');
    expect(filters[0]).toContain('CategoryId eq 483');
  });

  it('gives a Grow-only editor just the Grow Courses list for MNL | ALL EVENTS (590)', async () => {
    mockGetRockSession.mockResolvedValue(growOnly);
    const filters = route(590, 'MNL | ALL EVENTS', []);

    await rockGetScheduleOptions(590, '2026-10-04');

    expect(filters).toEqual(['CategoryId eq 483 and IsActive eq true']);
  });
});

describe('rockGetScheduleOptions - date filtering reads RDATE lists', () => {
  // Live Manila ALL EVENTS schedules as of 2026-10-04.
  const ical = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const TUESDAY_SCHEDULES = [
    {
      Id: 513,
      Name: 'MNL Tuesday Meeting',
      CategoryId: 484,
      iCalendarContent: ical('DTSTART:20260728T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU'),
    },
    {
      Id: 476,
      Name: 'MNL Grow - Bible Masterclass',
      CategoryId: 483,
      iCalendarContent: ical('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000,20261020T190000'),
      EffectiveEndDate: '2026-10-20T00:00:00',
    },
    {
      Id: 477,
      Name: 'MNL Grow - Bible Essentials',
      CategoryId: 483,
      iCalendarContent: ical('DTSTART:20260929T190000\r\nRDATE:20261006T190000,20261013T190000,20261020T190000'),
      EffectiveEndDate: '2026-10-20T00:00:00',
    },
    {
      Id: 660,
      Name: 'MNL Wednesday Prayer',
      CategoryId: 484,
      iCalendarContent: ical('DTSTART:20260826T070000\r\nRRULE:FREQ=WEEKLY;BYDAY=WE'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T10:00:00+08:00'));
    mockGetRockSession.mockResolvedValue({ rolesMap: { editor: ['true'] }, access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: ['MNL'] } } as any);
    mockRockGet.mockImplementation(async (url: string) => {
      if (url === '/Categories') return SCHEDULE_CATEGORIES as any;
      if (url === '/Categories/590') return { Id: 590, Name: 'MNL | ALL EVENTS' } as any;
      if (url === '/Schedules') return TUESDAY_SCHEDULES as any;
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists every schedule occurring on Tuesday 6 October, with its own start time', async () => {
    const res = await rockGetScheduleOptions(590, '2026-10-06');

    expect(res.schedules.map((s) => [s.name, s.timeLabel])).toEqual([
      ['MNL Tuesday Meeting', '9AM'],
      ['MNL Grow - Bible Masterclass', '7PM'],
      ['MNL Grow - Bible Essentials', '7PM'],
    ]);
  });

  it('drops an RDATE course after its last date', async () => {
    const res = await rockGetScheduleOptions(590, '2026-10-27');

    expect(res.schedules.map((s) => s.name)).toEqual(['MNL Tuesday Meeting']);
  });
});

describe('rockGetScheduleOptions - campus scope', () => {
  const campusUser = (...campuses: string[]) => ({
    rolesMap: { editor: ['true'] },
    access: { runsheetCampuses: campuses, runsheetEditCampuses: campuses },
  });
  const PERSONAS: Record<string, any> = {
    MNL: campusUser('MNL'),
    BNE: campusUser('BNE'),
    SEL: campusUser('SEL'),
    Global: { rolesMap: { editor: ['true'] }, access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] } },
    'GLB view-only': { rolesMap: { viewer: ['true'] }, access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: [] } },
  };

  const CATEGORY_NAMES: Record<number, string> = {
    336: 'MNL | Sunday Service',
    436: 'BNE | Sunday Service',
    536: 'SEL | Sunday Service',
    50: 'SUNDAY SERVICES',
    302: '🇵🇭 Manila',
    303: '🇦🇺 Brisbane',
    304: '🇰🇷 Seoul',
    417: 'Crowne',
    590: 'MNL | ALL EVENTS',
    700: 'Special Services',
  };
  const SCHEDULES = [
    ...SUNDAY_CROWNE_SCHEDULES,
    { Id: 801, Name: 'BNE 10AM', CategoryId: 303, iCalendarContent: WEEKLY_SUNDAY('100000') },
    { Id: 802, Name: 'SEL 11AM', CategoryId: 304, iCalendarContent: WEEKLY_SUNDAY('110000') },
    { Id: 803, Name: 'MNL Family Night', CategoryId: 305, iCalendarContent: WEEKLY_SUNDAY('180000') },
    { Id: 804, Name: 'BNE Family Night', CategoryId: 306, iCalendarContent: WEEKLY_SUNDAY('180000') },
  ];
  const OWN_CATEGORY: Record<string, number> = { MNL: 336, BNE: 436, SEL: 536 };
  const OWN_SCHEDULES: Record<string, string[]> = {
    MNL: ['MNL Crowne 9AM', 'MNL Crowne 11:30AM'],
    BNE: ['BNE 10AM'],
    SEL: ['SEL 11AM'],
  };

  let scheduleQueries: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T10:00:00+08:00'));
    scheduleQueries = [];
    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/Categories') return SCHEDULE_CATEGORIES as any;
      const id = Number(url.match(/^\/Categories\/(\d+)$/)?.[1]);
      if (id) return CATEGORY_NAMES[id] ? ({ Id: id, Name: CATEGORY_NAMES[id] } as any) : null;
      if (url === '/Schedules') {
        const filter = String(params?.$filter || '');
        scheduleQueries.push(filter);
        return SCHEDULES.filter((s) => new RegExp(`CategoryId eq ${s.CategoryId}\\b`).test(filter)) as any;
      }
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['MNL', 'BNE', 'SEL'])('%s user sees their own Sunday schedules', async (campus) => {
    mockGetRockSession.mockResolvedValue(PERSONAS[campus]);

    const res = await rockGetScheduleOptions(OWN_CATEGORY[campus], '2026-10-04');

    expect(res.success).toBe(true);
    expect(res.schedules.map((s) => s.name)).toEqual(OWN_SCHEDULES[campus]);
  });

  it.each([
    ['MNL', 436],
    ['MNL', 303],
    ['BNE', 336],
    ['BNE', 302],
    ['BNE', 417],
    ['SEL', 302],
    ['SEL', 436],
  ])('%s user gets nothing for another campus\'s category %i, without querying its schedules', async (campus, categoryId) => {
    mockGetRockSession.mockResolvedValue(PERSONAS[campus]);

    const res = await rockGetScheduleOptions(categoryId, '2026-10-04');

    expect(res).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });

  it.each(['Global', 'GLB view-only'])('%s user sees every campus', async (persona) => {
    mockGetRockSession.mockResolvedValue(PERSONAS[persona]);

    expect((await rockGetScheduleOptions(336, '2026-10-04')).schedules.map((s) => s.name)).toEqual(OWN_SCHEDULES.MNL);
    expect((await rockGetScheduleOptions(303, '2026-10-04')).schedules.map((s) => s.name)).toEqual(OWN_SCHEDULES.BNE);
    const all = await rockGetScheduleOptions(50, '2026-10-04');
    expect(all.schedules.map((s) => s.name)).toEqual(expect.arrayContaining(['MNL Crowne 9AM', 'BNE 10AM', 'SEL 11AM']));
  });

  it('narrows the top-level Sunday tree (50) to a one-campus user\'s own campus', async () => {
    mockGetRockSession.mockResolvedValue(PERSONAS.BNE);

    const res = await rockGetScheduleOptions(50, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['BNE 10AM']);
    expect(scheduleQueries[0]).not.toMatch(/CategoryId eq 50\b/);
    expect(scheduleQueries[0]).not.toContain('CategoryId eq 302');
  });

  it('defaults an omitted category to a one-campus user\'s own trees only', async () => {
    mockGetRockSession.mockResolvedValue(PERSONAS.BNE);

    const res = await rockGetScheduleOptions(undefined, '2026-10-04');

    expect(res.success).toBe(true);
    expect(scheduleQueries).toHaveLength(1);
    expect(scheduleQueries[0]).toContain('CategoryId eq 303');
    expect(scheduleQueries[0]).toContain('CategoryId eq 306');
    for (const other of [50, 171, 302, 305, 304, 307]) {
      expect(scheduleQueries[0]).not.toMatch(new RegExp(`CategoryId eq ${other}\\b`));
    }
  });

  it('resolves an unmarked category to a one-campus user\'s own campus', async () => {
    mockGetRockSession.mockResolvedValue(PERSONAS.BNE);

    const res = await rockGetScheduleOptions(700, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['BNE Family Night']);
  });

  it('fails closed when a multi-campus user picks a category with no resolvable campus', async () => {
    mockGetRockSession.mockResolvedValue(campusUser('MNL', 'BNE') as any);

    expect(await rockGetScheduleOptions(700, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(await rockGetScheduleOptions(50, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(await rockGetScheduleOptions(undefined, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });

  it('fails closed on an unmarked category when no unique non-Global home campus exists', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'] },
      access: { runsheetCampuses: ['MNL', 'BNE'], runsheetEditCampuses: ['BNE'] },
    } as any);

    const res = await rockGetScheduleOptions(700, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['BNE Family Night']);
  });

  it('gives a BNE editor who is also a Grow editor the Grow list for the Grow category', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'], growEditor: ['19108'] },
      access: { runsheetCampuses: ['BNE'], runsheetEditCampuses: ['BNE'] },
    } as any);

    await rockGetScheduleOptions(590, '2026-10-04');

    expect(scheduleQueries).toEqual(['CategoryId eq 483 and IsActive eq true']);
  });

  it('keeps an MNL editor who is also a Grow editor on the full Manila events list', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'], growEditor: ['19108'] },
      access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: ['MNL'] },
    } as any);

    const res = await rockGetScheduleOptions(590, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['MNL Family Night']);
  });

  it('keeps a Global editor who is also a Grow editor on the full Manila events list', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'], growEditor: ['19108'] },
      access: { runsheetCampuses: ['ALL'], runsheetEditCampuses: ['ALL'] },
    } as any);

    const res = await rockGetScheduleOptions(590, '2026-10-04');

    expect(res.schedules.map((s) => s.name)).toEqual(['MNL Family Night']);
    expect(scheduleQueries).not.toContain('CategoryId eq 483 and IsActive eq true');
  });

  it('prefers the single view campus over a different single edit campus', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'] },
      access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: ['BNE'] },
    } as any);

    expect((await rockGetScheduleOptions(700, '2026-10-04')).schedules.map((s) => s.name)).toEqual(['MNL Family Night']);
  });

  it('still fails closed when the single edit campus is outside the view campuses', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { editor: ['true'] },
      access: { runsheetCampuses: ['MNL', 'BNE'], runsheetEditCampuses: ['SEL'] },
    } as any);

    expect(await rockGetScheduleOptions(700, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });

  it.each([
    ['a BNE viewer', { viewer: ['true'] }, ['BNE']],
    ['a SEL viewer', { viewer: ['true'] }, ['SEL']],
    ['a rostered volunteer', { rosteredViewer: ['MNL:2026-10-04:10:00:00'] }, []],
    ['a Grow viewer', { growViewer: ['477:2026-10-06'] }, []],
  ])('gives %s no Grow schedules for the Grow category', async (_label, rolesMap, campuses) => {
    mockGetRockSession.mockResolvedValue({
      rolesMap,
      access: { runsheetCampuses: campuses, runsheetEditCampuses: [] },
    } as any);

    expect(await rockGetScheduleOptions(590, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });

  it('keeps the Grow list for an MNL viewer, as before', async () => {
    mockGetRockSession.mockResolvedValue({
      rolesMap: { viewer: ['true'] },
      access: { runsheetCampuses: ['MNL'], runsheetEditCampuses: [] },
    } as any);

    await rockGetScheduleOptions(590, '2026-10-04');

    expect(scheduleQueries).toEqual(['CategoryId eq 483 and IsActive eq true']);
  });

  it('fails closed on the top-level trees for a user holding all three campuses but not Global', async () => {
    mockGetRockSession.mockResolvedValue(campusUser('MNL', 'BNE', 'SEL') as any);

    expect(await rockGetScheduleOptions(50, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(await rockGetScheduleOptions(undefined, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });

  it('gives a user with no campus nothing outside the Grow path', async () => {
    mockGetRockSession.mockResolvedValue({ rolesMap: { viewer: ['true'] }, access: { runsheetCampuses: [], runsheetEditCampuses: [] } } as any);

    expect(await rockGetScheduleOptions(336, '2026-10-04')).toEqual({ success: true, schedules: [] });
    expect(scheduleQueries).toEqual([]);
  });
});
