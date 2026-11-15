/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  CampusSwitcher,
  getCampusSwitcherPreference,
  hasAllCampusAccess,
  setCampusSwitcherPreference,
  STORAGE_KEY_CAMPUS_SWITCHER,
} from '@/components/runsheet/CampusSwitcher';

describe('CampusSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders All, MNL, BNE, SEL and reports the clicked campus', () => {
    const onChange = jest.fn();
    render(<CampusSwitcher value="MNL" onChange={onChange} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'MNL', 'BNE', 'SEL']);
    expect(screen.getByRole('button', { name: 'MNL' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('ALL');
  });

  it('defaults the preference to null and round-trips a stored campus in sessionStorage', () => {
    expect(getCampusSwitcherPreference()).toBeNull();
    setCampusSwitcherPreference('SEL');
    expect(window.sessionStorage.getItem(STORAGE_KEY_CAMPUS_SWITCHER)).toBe('SEL');
    expect(getCampusSwitcherPreference()).toBe('SEL');
  });

  it('clears legacy localStorage and ignores its value', () => {
    window.localStorage.setItem(STORAGE_KEY_CAMPUS_SWITCHER, 'MNL');
    expect(getCampusSwitcherPreference()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY_CAMPUS_SWITCHER)).toBeNull();
  });

  it('ignores an unknown stored value', () => {
    window.sessionStorage.setItem(STORAGE_KEY_CAMPUS_SWITCHER, 'LAX');
    expect(getCampusSwitcherPreference()).toBeNull();
  });

  it('falls back to null and swallows errors when storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(getCampusSwitcherPreference()).toBeNull();
    expect(() => setCampusSwitcherPreference('BNE')).not.toThrow();
  });

  it('grants the switcher only to an ALL scope', () => {
    expect(hasAllCampusAccess(['ALL'])).toBe(true);
    expect(hasAllCampusAccess(['MNL', 'BNE', 'SEL'])).toBe(false);
    expect(hasAllCampusAccess([])).toBe(false);
    expect(hasAllCampusAccess(undefined)).toBe(false);
  });
});
