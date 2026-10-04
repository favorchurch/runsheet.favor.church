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
      rolesMap: { editor: ['true'] },
      access: { runsheetCampuses: ['MNL', 'BNE', 'SEL'] },
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
  const editor = { rolesMap: { editor: ['true'] }, access: { runsheetCampuses: ['MNL'] } } as any;
  const growOnly = { rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [] } } as any;

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
    mockGetRockSession.mockResolvedValue({ rolesMap: { editor: ['true'] }, access: { runsheetCampuses: ['MNL'] } } as any);
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
