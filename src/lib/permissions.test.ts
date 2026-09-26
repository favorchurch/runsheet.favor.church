import { describe, expect, it } from '@jest/globals';
import { canUserAccessRunsheet, canUserEditRunsheet, hasFullEditorRole } from './permissions';

describe('runsheet access permissions', () => {
  it('allows an editor to access runsheets even without a viewer role', () => {
    expect(canUserAccessRunsheet({ rolesMap: { editor: ['editor-only'] } })).toBe(true);
  });

  it('denies a principal without viewer or editor access', () => {
    expect(canUserAccessRunsheet({ rolesMap: {} })).toBe(false);
  });

  it('treats a Grow editor as able to edit and access', () => {
    const user = { rolesMap: { growEditor: ['19108'] } };
    expect(canUserEditRunsheet(user)).toBe(true);
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(hasFullEditorRole(user)).toBe(false);
  });

  it('treats a Grow viewer as able to access but not edit', () => {
    const user = { rolesMap: { growViewer: ['477:2026-09-29'] } };
    expect(canUserAccessRunsheet(user)).toBe(true);
    expect(canUserEditRunsheet(user)).toBe(false);
  });
});
