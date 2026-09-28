import { describe, expect, it, jest, beforeEach } from '@jest/globals';
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
});
