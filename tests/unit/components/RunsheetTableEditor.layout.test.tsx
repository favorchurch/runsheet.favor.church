/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof (global as any).Request === 'undefined') {
  (global as any).Request = class Request {};
}
if (typeof (global as any).Response === 'undefined') {
  (global as any).Response = class Response {};
}

jest.mock('@auth0/nextjs-auth0', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');
jest.mock('@/server-actions/rockDeleteServiceRunsheet');
jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/lib/richText', () => ({
  htmlToPlainText: (s: string) => s,
  legacyValueToHtml: (s: string) => s,
  sanitizeRichText: (s: string) => s,
  RICH_TEXT_ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'span', 'br', 'ul', 'ol', 'li', 'a'],
  RICH_TEXT_ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'rel'],
}));

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { STORAGE_KEY_VIEW_MODE, STORAGE_KEY_ROSTER_COLLAPSED } from '@/lib/userPreferences';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('RunsheetTableEditor layout & column ordering', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  const columnsWithDescFirst: DynamicAttributeColumn[] = [
    { id: 101, key: 'DESCRIPTION', name: 'Detail' },
    { id: 102, key: 'PLATFORM', name: 'Platform', fieldTypeId: 18 },
    { id: 103, key: 'MAININSTRUMENT', name: 'Main Instrument' },
    { id: 104, key: 'NOTES', name: 'Program Notes' },
    { id: 105, key: 'LIGHTING', name: 'Lighting' },
  ];

  const items: RunsheetItemRow[] = [
    {
      id: 1,
      title: 'Welcome',
      order: 1,
      duration: 5,
      attributeValues: {
        ACTIVITYTITLE: 'Welcome',
        DESCRIPTION: 'Detail info',
        PLATFORM: 'Pastor John',
        MAININSTRUMENT: 'Acoustic Guitar',
        NOTES: 'Specific cue notes',
        LIGHTING: 'Warm wash',
      },
    },
  ];

  test('defaults to Table view even when touch pointer is detected (mobile)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    const tableViewButton = screen.getByRole('button', { name: /Table view/i });
    expect(tableViewButton).toHaveAttribute('aria-pressed', 'true');

    const cardViewButton = screen.getByRole('button', { name: /Card view/i });
    expect(cardViewButton).toHaveAttribute('aria-pressed', 'false');

    // Table view schedule header is visible
    expect(screen.getByText('Runsheet Schedule')).toBeInTheDocument();
  });

  test('ensures Platform column appears before Description column in table view', () => {
    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    const platformHeaderIndex = headers.indexOf('Platform');
    const descriptionHeaderIndex = headers.indexOf('Detail');

    expect(platformHeaderIndex).toBeGreaterThan(-1);
    expect(descriptionHeaderIndex).toBeGreaterThan(-1);
    expect(platformHeaderIndex).toBeLessThan(descriptionHeaderIndex);
  });

  test('adjusts column widths such that description, main instrument, and program notes have 1.5x width (150px)', () => {
    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    const platformHeader = screen.getByTitle('Platform');
    const descriptionHeader = screen.getByTitle('Detail');
    const mainInstrumentHeader = screen.getByTitle('Main Instrument');
    const programNotesHeader = screen.getByTitle('Program Notes');
    const lightingHeader = screen.getByTitle('Lighting');

    // Standard columns (Platform, Lighting) = 100px width
    expect(platformHeader).toHaveStyle({ width: '100px', minWidth: '85px' });
    expect(lightingHeader).toHaveStyle({ width: '100px', minWidth: '85px' });

    // Expanded columns (Description/Detail, Main Instrument, Program Notes) = 1.5x width (150px / 130px)
    expect(descriptionHeader).toHaveStyle({ width: '150px', minWidth: '130px' });
    expect(mainInstrumentHeader).toHaveStyle({ width: '150px', minWidth: '130px' });
    expect(programNotesHeader).toHaveStyle({ width: '150px', minWidth: '130px' });
  });

  test('hydrates view mode from localStorage on mount and updates on toggle', () => {
    window.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'cards');

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    const cardViewButton = screen.getByRole('button', { name: /Card view/i });
    const tableViewButton = screen.getByRole('button', { name: /Table view/i });

    expect(cardViewButton).toHaveAttribute('aria-pressed', 'true');
    expect(tableViewButton).toHaveAttribute('aria-pressed', 'false');

    // Toggle back to Table view
    fireEvent.click(tableViewButton);
    expect(tableViewButton).toHaveAttribute('aria-pressed', 'true');
    expect(cardViewButton).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem(STORAGE_KEY_VIEW_MODE)).toBe('grid');

    // Toggle to Card view
    fireEvent.click(cardViewButton);
    expect(cardViewButton).toHaveAttribute('aria-pressed', 'true');
    expect(tableViewButton).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem(STORAGE_KEY_VIEW_MODE)).toBe('cards');
  });

  test('defaults roster collapsed state to true (hidden) and allows toggling with localStorage persistence', () => {
    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    // Initial default: collapsed (Show Roster button present, Service Roles hidden)
    const showRosterButton = screen.getByRole('button', { name: /Show Roster/i });
    expect(showRosterButton).toBeInTheDocument();
    expect(screen.queryByText('Service Roles')).not.toBeInTheDocument();

    // Toggle expand
    fireEvent.click(showRosterButton);
    expect(screen.getByRole('button', { name: /Hide Roster/i })).toBeInTheDocument();
    expect(screen.getByText('Service Roles')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY_ROSTER_COLLAPSED)).toBe('false');

    // Toggle collapse
    const hideRosterButton = screen.getByRole('button', { name: /Hide Roster/i });
    fireEvent.click(hideRosterButton);
    expect(screen.getByRole('button', { name: /Show Roster/i })).toBeInTheDocument();
    expect(screen.queryByText('Service Roles')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY_ROSTER_COLLAPSED)).toBe('true');
  });

  test('hydrates roster expanded state when false is saved in localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY_ROSTER_COLLAPSED, 'false');

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columnsWithDescFirst}
        initialItems={items}
        initialStartTime="10:00 AM"
      />
    );

    // Hydrated state: expanded (Hide Roster button present, Service Roles visible)
    expect(screen.getByRole('button', { name: /Hide Roster/i })).toBeInTheDocument();
    expect(screen.getByText('Service Roles')).toBeInTheDocument();
  });
});
