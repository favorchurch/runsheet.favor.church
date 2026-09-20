/**
 * @jest-environment jsdom
 */
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels', () => ({
  rockGetAvailableRunsheetChannels: jest.fn(),
}));
jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({
  rockGetRunsheetDetails: jest.fn(),
}));

import { getRunsheetAccessScope, runsheetQueryKeys } from '@/components/runsheet/runsheetQueries';

describe('runsheet query keys', () => {
  it('includes the authenticated access scope in authorized channel and detail keys', () => {
    const channels = runsheetQueryKeys.channels as any;
    const details = runsheetQueryKeys.details as any;

    expect(channels(false, 'principal-a')).not.toEqual(channels(false, 'principal-b'));
    expect(details(42, 'principal-a')).not.toEqual(details(42, 'principal-b'));
    expect(channels(false, 'principal-a')).toEqual(channels(false, 'principal-a'));
  });

  it('creates the same discriminator for equivalent access data and a new one after access changes', () => {
    const first = {
      sub: 'auth0|person-1',
      access: { runsheetCampuses: ['SEL', 'MNL'], campusIds: [2, 1] },
    } as any;
    const equivalent = {
      sub: 'auth0|person-1',
      access: { runsheetCampuses: ['MNL', 'SEL'], campusIds: [1, 2] },
    } as any;
    const changed = {
      sub: 'auth0|person-1',
      access: { runsheetCampuses: ['MNL'], campusIds: [1] },
    } as any;

    expect(getRunsheetAccessScope(first)).toBe(getRunsheetAccessScope(equivalent));
    expect(getRunsheetAccessScope(first)).not.toBe(getRunsheetAccessScope(changed));
    expect(runsheetQueryKeys.details(42, getRunsheetAccessScope(first))).not.toEqual(
      runsheetQueryKeys.details(42, getRunsheetAccessScope(changed)),
    );
  });

  it('changes the discriminator when roles change and ignores role ordering', () => {
    const editor = {
      sub: 'auth0|person-1',
      rolesMap: { viewer: ['viewer-group'], editor: ['editor-group', 'shared-group'] },
      access: { runsheetCampuses: ['MNL'], campusIds: [1] },
    } as any;
    const equivalent = {
      sub: 'auth0|person-1',
      rolesMap: { editor: ['shared-group', 'editor-group'], viewer: ['viewer-group'] },
      access: { runsheetCampuses: ['MNL'], campusIds: [1] },
    } as any;
    const viewer = {
      sub: 'auth0|person-1',
      rolesMap: { viewer: ['viewer-group'] },
      access: { runsheetCampuses: ['MNL'], campusIds: [1] },
    } as any;

    expect(getRunsheetAccessScope(editor)).toBe(getRunsheetAccessScope(equivalent));
    expect(getRunsheetAccessScope(editor)).not.toBe(getRunsheetAccessScope(viewer));
    expect(runsheetQueryKeys.channels(true, getRunsheetAccessScope(editor))).not.toEqual(
      runsheetQueryKeys.channels(true, getRunsheetAccessScope(viewer)),
    );
  });
});
