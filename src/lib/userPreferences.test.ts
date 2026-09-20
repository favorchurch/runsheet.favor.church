/**
 * @jest-environment jsdom
 */
import {
  getViewModePreference,
  setViewModePreference,
  getRosterCollapsedPreference,
  setRosterCollapsedPreference,
  STORAGE_KEY_VIEW_MODE,
  STORAGE_KEY_ROSTER_COLLAPSED,
} from './userPreferences';

describe('userPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('View Mode preference', () => {
    test('defaults to "grid" when localStorage is empty', () => {
      expect(getViewModePreference()).toBe('grid');
    });

    test('returns "cards" when "cards" is stored', () => {
      window.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'cards');
      expect(getViewModePreference()).toBe('cards');
    });

    test('returns "grid" when "grid" is stored', () => {
      window.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'grid');
      expect(getViewModePreference()).toBe('grid');
    });

    test('defaults to "grid" when stored value is unrecognized or invalid', () => {
      window.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'unknown_mode');
      expect(getViewModePreference()).toBe('grid');

      window.localStorage.setItem(STORAGE_KEY_VIEW_MODE, '');
      expect(getViewModePreference()).toBe('grid');
    });

    test('persists "cards" and "grid" view modes', () => {
      setViewModePreference('cards');
      expect(window.localStorage.getItem(STORAGE_KEY_VIEW_MODE)).toBe('cards');
      expect(getViewModePreference()).toBe('cards');

      setViewModePreference('grid');
      expect(window.localStorage.getItem(STORAGE_KEY_VIEW_MODE)).toBe('grid');
      expect(getViewModePreference()).toBe('grid');
    });

    test('handles getItem exception gracefully and falls back to "grid"', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Access is denied');
      });
      expect(getViewModePreference()).toBe('grid');
    });

    test('handles setItem exception gracefully without throwing', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => setViewModePreference('cards')).not.toThrow();
    });
  });

  describe('Roster Collapsed preference', () => {
    test('defaults to true (collapsed) when localStorage is empty', () => {
      expect(getRosterCollapsedPreference()).toBe(true);
    });

    test('returns false when "false" is stored (expanded)', () => {
      window.localStorage.setItem(STORAGE_KEY_ROSTER_COLLAPSED, 'false');
      expect(getRosterCollapsedPreference()).toBe(false);
    });

    test('returns true when "true" is stored (collapsed)', () => {
      window.localStorage.setItem(STORAGE_KEY_ROSTER_COLLAPSED, 'true');
      expect(getRosterCollapsedPreference()).toBe(true);
    });

    test('defaults to true when stored value is invalid', () => {
      window.localStorage.setItem(STORAGE_KEY_ROSTER_COLLAPSED, 'invalid_value');
      expect(getRosterCollapsedPreference()).toBe(true);

      window.localStorage.setItem(STORAGE_KEY_ROSTER_COLLAPSED, '');
      expect(getRosterCollapsedPreference()).toBe(true);
    });

    test('persists roster collapsed state to localStorage', () => {
      setRosterCollapsedPreference(false);
      expect(window.localStorage.getItem(STORAGE_KEY_ROSTER_COLLAPSED)).toBe('false');
      expect(getRosterCollapsedPreference()).toBe(false);

      setRosterCollapsedPreference(true);
      expect(window.localStorage.getItem(STORAGE_KEY_ROSTER_COLLAPSED)).toBe('true');
      expect(getRosterCollapsedPreference()).toBe(true);
    });

    test('handles getItem exception gracefully and falls back to true', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Access is denied');
      });
      expect(getRosterCollapsedPreference()).toBe(true);
    });

    test('handles setItem exception gracefully without throwing', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => setRosterCollapsedPreference(false)).not.toThrow();
    });
  });
});
