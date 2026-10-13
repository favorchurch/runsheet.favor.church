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
jest.mock('@/server-actions/rockDuplicateServiceRunsheet');
jest.mock('@/server-actions/rockDeleteServiceRunsheet');
jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/components/runsheet/runsheetQueries', () => ({
  ...jest.requireActual('@/components/runsheet/runsheetQueries'),
  useRosterAssignments: () => ({ data: undefined }),
}));
jest.mock('@/lib/richText', () => ({
  htmlToPlainText: (s: string) => s,
  legacyValueToHtml: (s: string) => s,
  sanitizeRichText: (s: string) => s,
  extractCellUrl: (s: string) => ({ contentHtml: s, url: null }),
  embedCellUrl: (contentHtml: string, url: string | null) => (url ? `${contentHtml}${url}` : contentHtml),
  isRichTextEmpty: (s: string) => !s,
  normalizeRichTextValue: (s: string) => s || '',
  RICH_TEXT_ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'span', 'br', 'ul', 'ol', 'li', 'a'],
  RICH_TEXT_ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'rel', 'data-cell-url'],
}));

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('RunsheetTableEditor Mobile-first layout', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  const columns: DynamicAttributeColumn[] = [
    { id: 101, key: 'DESCRIPTION', name: 'Detail' },
    { id: 102, key: 'PLATFORM', name: 'Platform', fieldTypeId: 18 },
    { id: 103, key: 'LIGHTING', name: 'Lighting' },
    { id: 104, key: 'AUDIO', name: 'Audio' },
  ];

  const multiSongItems: RunsheetItemRow[] = [
    {
      id: 1,
      title: 'Praise & Worship',
      order: 1,
      duration: 15,
      attributeValues: {
        ACTIVITYTITLE: 'Praise & Worship',
        SONGS: 'Graves Into Gardens, Way Maker, Goodness of God',
        DESCRIPTION: 'This is a very long segment description detailing the transitions between the opening song, the bridge section, and the closing prayer response. It spans multiple lines and paragraphs without being clipped.',
        PLATFORM: 'Worship Leader A',
        LIGHTING: 'Dynamic build from warm amber to full bright cue',
        AUDIO: 'Wireless handheld 1, acoustic guitar on DI 3',
      },
    },
    {
      id: 2,
      title: 'Pastoral Welcome',
      order: 2,
      duration: 5,
      attributeValues: {
        ACTIVITYTITLE: 'Pastoral Welcome',
        DESCRIPTION: 'Welcome visitors and first-time guests.',
        PLATFORM: 'Pastor Mark',
      },
    },
  ];

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: width < 768 && (query.includes('max-width') || query.includes('768') || query.includes('767')),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }

  describe('ACCEPT 1: View mode default below 768px vs desktop', () => {
    it('defaults to Cards view below 768px when no preference is saved', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      const cardViewButton = screen.getByRole('button', { name: /Card view/i });
      const tableViewButton = screen.getByRole('button', { name: /Table view/i });

      expect(cardViewButton).toHaveAttribute('aria-pressed', 'true');
      expect(tableViewButton).toHaveAttribute('aria-pressed', 'false');

      // Table toggle is labeled with text "Cards" and "Table"
      expect(screen.getByText('Cards')).toBeInTheDocument();
      expect(screen.getByText('Table')).toBeInTheDocument();
    });

    it('defaults to Table view on desktop (>=768px)', () => {
      setViewportWidth(1024);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      const cardViewButton = screen.getByRole('button', { name: /Card view/i });
      const tableViewButton = screen.getByRole('button', { name: /Table view/i });

      expect(tableViewButton).toHaveAttribute('aria-pressed', 'true');
      expect(cardViewButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('allows toggling between Cards and Table view', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      const tableViewButton = screen.getByRole('button', { name: /Table view/i });
      fireEvent.click(tableViewButton);

      expect(tableViewButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /Card view/i })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('ACCEPT 2: Card segments structure, multi-song segments, details expansion', () => {
    it('renders time, duration, title and song names at top of card, and department fields in expandable details', () => {
      setViewportWidth(400);

      const { container } = render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      const card1 = container.querySelector('#card_item_1') as HTMLElement;
      expect(card1).toBeInTheDocument();

      // Top elements visible inside the card
      expect(within(card1).getByText('10:00:00 AM')).toBeInTheDocument();
      expect(within(card1).getByText('(00:15:00)')).toBeInTheDocument();
      expect(within(card1).getByText('Praise & Worship')).toBeInTheDocument();

      // Multi-song segment: song names rendered at top
      expect(screen.getByText('Graves Into Gardens')).toBeInTheDocument();
      expect(screen.getByText('Way Maker')).toBeInTheDocument();
      expect(screen.getByText('Goodness of God')).toBeInTheDocument();

      // Department fields are collapsed by default in details section of the card
      expect(within(card1).queryByText(/Dynamic build from warm amber/i)).not.toBeInTheDocument();
      expect(within(card1).queryByText(/Wireless handheld 1/i)).not.toBeInTheDocument();

      // Details toggle button is present
      const toggleButton = within(card1).getByRole('button', { name: /Show details for Praise & Worship/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      // Expand details
      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

      // Now department fields (Platform, Lighting, Audio, Long Description) are revealed in the card
      expect(within(card1).getByText(/Dynamic build from warm amber/i)).toBeInTheDocument();
      expect(within(card1).getByText(/Wireless handheld 1/i)).toBeInTheDocument();
      expect(within(card1).getByText(/This is a very long segment description detailing the transitions/i)).toBeInTheDocument();

      // Collapse details again
      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      expect(within(card1).queryByText(/Dynamic build from warm amber/i)).not.toBeInTheDocument();
    });

    it('card container does not set fixed or duration-scaled height', () => {
      setViewportWidth(400);

      const { container } = render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      const card = container.querySelector('#card_item_1');
      expect(card).toBeInTheDocument();
      expect(card?.getAttribute('style') || '').not.toMatch(/height:/i);
    });
  });

  describe('ACCEPT 3: Mobile sticky header and overflow menu', () => {
    it('renders single compact row with read-only badge, Edit toggle, and overflow menu below 768px', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
          readOnly={true}
          canEdit={true}
        />
      );

      // Read-only badge is directly visible in header
      expect(screen.getByText('Read Only')).toBeInTheDocument();

      // Edit toggle remains visible directly in header
      expect(screen.getByRole('group', { name: 'Runsheet mode' })).toBeInTheDocument();

      // Share and Export PDF are NOT directly visible in header outside overflow
      const overflowBtn = screen.getByRole('button', { name: /More actions/i });
      expect(overflowBtn).toBeInTheDocument();
      expect(overflowBtn).toHaveAttribute('aria-expanded', 'false');

      // Open overflow menu
      fireEvent.click(overflowBtn);
      expect(overflowBtn).toHaveAttribute('aria-expanded', 'true');

      // Overflow menu contains Share and Export PDF
      const menu = screen.getByRole('menu', { name: /More actions menu/i });
      expect(menu).toBeInTheDocument();

      expect(screen.getByRole('menuitem', { name: /Share/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Export PDF/i })).toBeInTheDocument();
    });

    it('closes overflow menu when Escape key is pressed', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
          canEdit={true}
        />
      );

      const overflowBtn = screen.getByRole('button', { name: /More actions/i });
      fireEvent.click(overflowBtn);

      expect(screen.getByRole('menu', { name: /More actions menu/i })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByRole('menu', { name: /More actions menu/i })).not.toBeInTheDocument();
    });

    it('keeps subtitle and start time editable from the overflow menu', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
          canEdit={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /More actions/i }));

      const subtitle = screen.getByLabelText('Subtitle');
      fireEvent.change(subtitle, { target: { value: 'Youth Night' } });
      expect(subtitle).toHaveValue('Youth Night');

      const start = screen.getByLabelText('Start');
      fireEvent.change(start, { target: { value: '06:00 PM' } });
      expect(start).toHaveValue('06:00 PM');

      expect(screen.getByRole('button', { name: /Save Runsheet/i })).not.toBeDisabled();
    });

    it('keeps the menu open while exporting so the busy state is visible', () => {
      setViewportWidth(400);

      render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
          canEdit={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /More actions/i }));
      (global as any).fetch = jest.fn(() => new Promise(() => {}));
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));

      expect(screen.getByRole('menu', { name: /More actions menu/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Exporting/i })).toBeInTheDocument();
    });
  });

  describe('ACCEPT 4: Mobile table mode', () => {
    it('keeps schedule data available with a horizontally scrollable table and sticky start column', () => {
      setViewportWidth(400);

      const { container } = render(
        <RunsheetTableEditor
          channelId={1}
          channelName="Sun 10:00 AM"
          columns={columns}
          initialItems={multiSongItems}
          initialStartTime="10:00 AM"
        />
      );

      // Switch to Table view
      const tableViewButton = screen.getByRole('button', { name: /Table view/i });
      fireEvent.click(tableViewButton);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Start/i })).toBeInTheDocument();
      expect(screen.getByText('10:00:00 AM')).toBeInTheDocument();

      expect(screen.getByTestId('table-overflow-container')).toHaveClass('overflow-x-auto');
      expect(screen.getByTestId('sticky-time-header')).toHaveClass('sticky');
      expect(screen.getAllByTestId('sticky-time-cell')[0]).toHaveClass('sticky');
      expect((container.firstChild as HTMLElement).className).toMatch(/overflow-x-hidden|max-w-full/);
    });
  });
});
