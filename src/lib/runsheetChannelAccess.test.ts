import { describe, expect, it } from '@jest/globals';
import { canEditRunsheetChannel, canViewRunsheetChannel } from './runsheetChannelAccess';
import type { GrowSchedule } from './growRunsheets';

const grow: GrowSchedule[] = [{ id: 477, name: 'MNL Grow - Bible Essentials', iCalendarContent: '' }];
const GROW_TITLE = 'MNL Grow - Bible Essentials // September 29, 2026 // 7PM';
const OTHER_GROW = 'MNL Grow - Bible Essentials // October 6, 2026 // 7PM';
const SUNDAY = 'MNL Crowne // September 27, 2026 // 3PM';

describe('canViewRunsheetChannel', () => {
  it('keeps campus access for existing viewers', () => {
    const s = { rolesMap: { viewer: ['1'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
  });

  it('lets a Grow editor view every Grow runsheet but nothing else', () => {
    const s = { rolesMap: { growEditor: ['19108'] }, access: { runsheetCampuses: [] } };
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('lets a rostered viewer see only their occurrence', () => {
    const s = { rolesMap: { growViewer: ['477:2026-09-29'] }, access: { runsheetCampuses: [] } };
    expect(canViewRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canViewRunsheetChannel(s, OTHER_GROW, grow)).toBe(false);
    expect(canViewRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('denies a session with no roles', () => {
    expect(canViewRunsheetChannel({ rolesMap: {}, access: { runsheetCampuses: ['MNL'] } }, SUNDAY, grow)).toBe(false);
  });
});

describe('canEditRunsheetChannel', () => {
  it('keeps campus editing for existing editors', () => {
    const s = { rolesMap: { editor: ['1'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canEditRunsheetChannel(s, SUNDAY, grow)).toBe(true);
  });

  it('adds Grow editing on top of other access', () => {
    const s = { rolesMap: { viewer: ['1'], growEditor: ['19108'] }, access: { runsheetCampuses: ['MNL'] } };
    expect(canEditRunsheetChannel(s, GROW_TITLE, grow)).toBe(true);
    expect(canEditRunsheetChannel(s, SUNDAY, grow)).toBe(false);
  });

  it('never lets a Grow viewer edit', () => {
    const s = { rolesMap: { growViewer: ['477:2026-09-29'] }, access: { runsheetCampuses: [] } };
    expect(canEditRunsheetChannel(s, GROW_TITLE, grow)).toBe(false);
  });
});
