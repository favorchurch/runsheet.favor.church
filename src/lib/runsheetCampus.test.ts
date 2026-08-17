import { describe, expect, it } from '@jest/globals';
import { canAccessRunsheetChannel, extractRunsheetCampus, extractRunsheetCampuses } from './runsheetCampus';

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
