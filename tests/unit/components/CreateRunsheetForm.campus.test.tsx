/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockFetch: jest.fn() }));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({ assertAuthenticated: jest.fn() }));
jest.mock('@/auth0-hooks/server/getServerSession', () => ({ getServerSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/server-actions/rockCreateServiceRunsheet');
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  CreateRunsheetForm,
  filterCategoriesForCampuses,
  titleCampusError,
} from '@/components/runsheet/CreateRunsheetForm';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';

const categories = [
  { id: 10, name: 'MNL | SUNDAY SERVICES' },
  { id: 20, name: 'BNE | SUNDAY SERVICES' },
  { id: 30, name: 'SEL | SUNDAY SERVICES' },
  { id: 590, name: 'MNL | ALL EVENTS' },
];
const ids = (cats: { id: number }[]) => cats.map((c) => c.id);

describe('filterCategoriesForCampuses', () => {
  it('gives a Global scope every category', () => {
    expect(ids(filterCategoriesForCampuses(categories, ['ALL']))).toEqual([10, 20, 30, 590]);
  });

  it('limits a one-campus scope to that campus', () => {
    expect(ids(filterCategoriesForCampuses(categories, ['BNE']))).toEqual([20]);
  });

  it('fails closed with no campus options for a missing or empty scope', () => {
    expect(filterCategoriesForCampuses(categories, undefined)).toEqual([]);
    expect(filterCategoriesForCampuses(categories, [])).toEqual([]);
  });

  it('reads category campuses on word boundaries, not substrings', () => {
    const lookalikes = [
      { id: 40, name: 'COUNSELING' },
      { id: 41, name: 'VESSEL EVENTS' },
      { id: 42, name: 'BNE | YOUTH' },
    ];
    expect(ids(filterCategoriesForCampuses(lookalikes, ['MNL']))).toEqual([40, 41]);
    expect(ids(filterCategoriesForCampuses(lookalikes, ['SEL']))).toEqual([40, 41]);
  });

  it('keeps only the Grow category for a Grow-only editor, whatever the campus scope', () => {
    expect(ids(filterCategoriesForCampuses(categories, undefined, true))).toEqual([590]);
    expect(ids(filterCategoriesForCampuses(categories, ['BNE'], true))).toEqual([590]);
  });
});

describe('titleCampusError', () => {
  it('allows any campus for a Global scope', () => {
    expect(titleCampusError('SEL Service // August 9, 2026 // 10AM', ['ALL'])).toBeNull();
  });

  it('allows the scoped campus and rejects another', () => {
    expect(titleCampusError('MNL Crowne // August 9, 2026 // 10AM', ['MNL'])).toBeNull();
    expect(titleCampusError('BNE Service // August 9, 2026 // 10AM', ['MNL'])).toMatch(/assigned campus \(MNL\)/);
  });

  it('fails closed for a missing or empty scope', () => {
    expect(titleCampusError('MNL Crowne // August 9, 2026 // 10AM', undefined)).toMatch(/not authorized/);
    expect(titleCampusError('MNL Crowne // August 9, 2026 // 10AM', [])).toMatch(/not authorized/);
  });

  it('leaves Grow titles to the server for a Grow-only editor', () => {
    expect(titleCampusError('MNL Grow - Build // October 4, 2026 // 3PM', [], true)).toBeNull();
    expect(titleCampusError('MNL Crowne // October 4, 2026 // 3PM', [], true)).toMatch(/not authorized/);
  });
});

describe('CreateRunsheetForm campus options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRockContentChannelOptions as jest.Mock).mockResolvedValue({
      success: true,
      types: [{ id: 13, name: 'Service Runsheet' }],
      categories,
    });
    (rockGetScheduleOptions as jest.Mock).mockResolvedValue({ success: true, schedules: [] });
  });

  async function categoryOptions() {
    await waitFor(() => expect(getRockContentChannelOptions).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    const select = document.getElementById('category-select');
    return select ? Array.from(select.querySelectorAll('option')).map((o) => o.textContent) : [];
  }

  it('offers no campus categories when runsheetCampuses is undefined', async () => {
    render(<CreateRunsheetForm />);
    const options = await categoryOptions();
    expect(screen.getByRole('option', { name: /no categories/i })).toBeInTheDocument();
    expect(options.filter((o) => /MNL|BNE|SEL/.test(o || ''))).toEqual([]);
  });

  it('refuses to submit a title for a campus outside a one-campus scope', async () => {
    render(<CreateRunsheetForm runsheetCampuses={['MNL']} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'MNL | SUNDAY SERVICES' })).toBeInTheDocument());

    // Let the schedule load settle: it resets the session and regenerates the title.
    const titleInput = screen.getByRole('textbox');
    await waitFor(() => expect((titleInput as HTMLInputElement).value).toMatch(/^AM \/\/ .+ \/\/ AM$/));
    await waitFor(() => expect(screen.getAllByRole('combobox')[1]).not.toBeDisabled());
    fireEvent.change(titleInput, { target: { value: 'BNE Service // October 4, 2026 // 10AM' } });
    fireEvent.click(screen.getByRole('button', { name: /save runsheet/i }));

    expect(await screen.findByText(/assigned campus \(MNL\)/)).toBeInTheDocument();
    expect(rockCreateServiceRunsheet).not.toHaveBeenCalled();
  });

  it('offers every campus to a Global user', async () => {
    render(<CreateRunsheetForm runsheetCampuses={['ALL']} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'SEL | SUNDAY SERVICES' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'BNE | SUNDAY SERVICES' })).toBeInTheDocument();
  });

  it('offers only the scoped campus to a one-campus user', async () => {
    render(<CreateRunsheetForm runsheetCampuses={['BNE']} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'BNE | SUNDAY SERVICES' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'MNL | SUNDAY SERVICES' })).not.toBeInTheDocument();
  });
});
