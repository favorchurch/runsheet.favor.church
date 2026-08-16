import { describe, expect, it } from '@jest/globals';
import { canUserAccessRunsheet } from './permissions';

describe('runsheet access permissions', () => {
  it('allows an editor to access runsheets even without a viewer role', () => {
    expect(canUserAccessRunsheet({ rolesMap: { editor: ['editor-only'] } })).toBe(true);
  });

  it('denies a principal without viewer or editor access', () => {
    expect(canUserAccessRunsheet({ rolesMap: {} })).toBe(false);
  });
});
