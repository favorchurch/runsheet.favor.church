import { describe, expect, it } from '@jest/globals';
import {
  ALL_CAMPUSES,
  canAccessRunsheetChannel,
  canSeeRunsheetCategory,
  extractRunsheetCampus,
  extractRunsheetCampuses,
  scopeCampusCodes,
} from './runsheetCampus';

describe('runsheet campus matching', () => {
  it.each(['COUNSEL', 'SELAH', 'VESSEL', 'SELF'])('does not treat %s as SEL', (title) => {
    expect(extractRunsheetCampus(title)).toBeNull();
    expect(extractRunsheetCampuses(title)).toEqual([]);
  });

  it('matches a campus marker at the title boundary', () => {
    expect(extractRunsheetCampus('SEL Service // August 16')).toBe('SEL');
    expect(extractRunsheetCampus('Manila Service // August 16')).toBe('MNL');
  });

  it('fails closed when a title contains more than one campus marker', () => {
    expect(extractRunsheetCampuses('SEL Service (MNL Backup)')).toEqual(['MNL', 'SEL']);
    expect(extractRunsheetCampus('SEL Service (MNL Backup)')).toBeNull();
    expect(canAccessRunsheetChannel(['MNL'], 'SEL Service (MNL Backup)')).toBe(false);
  });
});

describe('runsheet campus edge cases', () => {
  it('reads full campus names in any case', () => {
    expect(extractRunsheetCampus('brisbane night // August 16')).toBe('BNE');
    expect(extractRunsheetCampus('Seoul Service // August 16')).toBe('SEL');
  });

  it('returns no campus for an empty title', () => {
    expect(extractRunsheetCampuses('')).toEqual([]);
    expect(extractRunsheetCampus('')).toBeNull();
  });

  it('lets ALL see any channel, including unlabeled ones', () => {
    expect(canAccessRunsheetChannel([ALL_CAMPUSES], 'Master Template')).toBe(true);
  });

  it('hides unlabeled or other-campus channels from campus-scoped and unscoped users', () => {
    expect(canAccessRunsheetChannel(['MNL'], 'Master Template')).toBe(false);
    expect(canAccessRunsheetChannel(['MNL'], 'BNE Service // August 16')).toBe(false);
    expect(canAccessRunsheetChannel(undefined, 'MNL Crowne // August 16')).toBe(false);
    expect(canAccessRunsheetChannel(['MNL'], 'MNL Crowne // August 16')).toBe(true);
  });
});

describe('canSeeRunsheetCategory', () => {
  it.each([
    [['ALL'], 'BNE | Sunday Service', true],
    [['ALL'], 'Special Services', true],
    [['MNL'], 'MNL | Sunday Service', true],
    [['MNL'], 'BNE | Sunday Service', false],
    [['SEL'], 'Seoul Youth', true],
    [['BNE'], 'Special Services', true],
    [['MNL', 'BNE'], 'MNL / BNE Joint Night', true],
    [['MNL'], 'MNL / BNE Joint Night', false],
    [[], 'Special Services', false],
    [[], 'MNL | Sunday Service', false],
    [undefined, 'Special Services', false],
  ])('scope %j and category %s: %s', (scope, name, expected) => {
    expect(canSeeRunsheetCategory(scope as string[] | undefined, name)).toBe(expected);
  });

  it('reads only real campus codes out of a scope', () => {
    expect(scopeCampusCodes(['ALL', 'BNE', 'XYZ', 'MNL'])).toEqual(['MNL', 'BNE']);
  });
});
