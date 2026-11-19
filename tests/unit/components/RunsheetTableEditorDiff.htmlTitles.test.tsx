/**
 * @jest-environment jsdom
 */
import { TextDecoder, TextEncoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof (global as any).Request === 'undefined') {
  (global as any).Request = class Request {};
}
if (typeof (global as any).Response === 'undefined') {
  (global as any).Response = class Response {};
}

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditorDiff';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import { rockGetRunsheetDetailsBatch } from '@/server-actions/rockGetRunsheetDetailsBatch';

jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('@/server-actions/rockGetRunsheetDetailsBatch');
jest.mock('@/server-actions/rockBulkSaveRunsheetItems');
jest.mock('@auth0/nextjs-auth0', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server-actions/internal/rockFetch');
jest.mock('@/auth0-hooks/server/assertAuthenticated');
jest.mock('@/auth0-hooks/server/getServerSession');
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/components/runsheet/RunsheetTableEditor', () => ({
  RunsheetTableEditor: () => <div data-testid="base-runsheet-editor" />,
}));

const mockChannels = jest.mocked(rockGetAvailableRunsheetChannels);
const mockBatch = jest.mocked(rockGetRunsheetDetailsBatch);
const mockWrite = jest.mocked(rockBulkSaveRunsheetItems);

const source9AmItems = [
  {
    id: 1,
    title: 'Runsheet Huddle',
    order: 1,
    duration: 10,
    attributeValues: {
      SIBLINGKEY: 'k-huddle',
      ACTIVITYTITLE: '<p><strong>Runsheet Huddle</strong></p>',
      NOTES: 'Same note',
    },
  },
  {
    id: 2,
    title: 'All-In Huddle',
    order: 2,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-all-in',
      ACTIVITYTITLE: '<p><strong>All-In Huddle</strong></p>',
      NOTES: '9AM only',
    },
  },
  {
    id: 3,
    title: 'Worship',
    order: 3,
    duration: 15,
    attributeValues: {
      SIBLINGKEY: 'k-worship',
      ACTIVITYTITLE: '<div><p><span style="color:#dc2626"><strong><em>Worship</em></strong></span> &amp; Prayer</p></div>',
      NOTES: 'Old set',
    },
  },
  {
    id: 4,
    title: "Pastor Rico's Q&A",
    order: 4,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-qa',
      ACTIVITYTITLE: '<p>Pastor&nbsp;Rico&#39;s Q&amp;A</p>',
      NOTES: 'Q&A notes',
    },
  },
  {
    id: 5,
    title: 'Safe Title',
    order: 5,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-xss',
      ACTIVITYTITLE:
        '<script>alert("xss")</script><style>body{display:none}</style><p onload="alert(1)" onclick="evil()"><img src="x" onerror="alert(2)" />Safe Segment</p>',
      NOTES: 'Check security',
    },
  },
  {
    id: 6,
    title: 'Doors Open',
    order: 6,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-doors',
      ACTIVITYTITLE: 'Doors Open',
      NOTES: 'Open doors',
    },
  },
];

const target1130AmItems = [
  {
    id: 11,
    title: 'Runsheet Huddle',
    order: 1,
    duration: 10,
    attributeValues: {
      SIBLINGKEY: 'k-huddle',
      ACTIVITYTITLE: '<p><strong>Runsheet Huddle</strong></p>',
      NOTES: 'Same note',
    },
  },
  {
    id: 13,
    title: 'Worship',
    order: 2,
    duration: 15,
    attributeValues: {
      SIBLINGKEY: 'k-worship',
      ACTIVITYTITLE: '<div><p><span style="color:#dc2626"><strong><em>Worship</em></strong></span> &amp; Prayer</p></div>',
      NOTES: 'Updated set',
    },
  },
  {
    id: 14,
    title: "Pastor Rico's Q&A",
    order: 3,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-qa',
      ACTIVITYTITLE: '<p>Pastor&nbsp;Rico&#39;s Q&amp;A</p>',
      NOTES: 'Q&A notes',
    },
  },
  {
    id: 15,
    title: 'Safe Title',
    order: 4,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-xss',
      ACTIVITYTITLE:
        '<script>alert("xss")</script><style>body{display:none}</style><p onload="alert(1)" onclick="evil()"><img src="x" onerror="alert(2)" />Safe Segment</p>',
      NOTES: 'Check security',
    },
  },
  {
    id: 16,
    title: 'Doors Open',
    order: 5,
    duration: 5,
    attributeValues: {
      SIBLINGKEY: 'k-doors',
      ACTIVITYTITLE: 'Doors Open',
      NOTES: 'Open doors',
    },
  },
];

async function open9AmTo1130Diff() {
  render(
    <RunsheetTableEditor
      channelId={1}
      channelName="MNL Crowne // November 15, 2026 // 9AM"
      columns={[{ id: 101, key: 'NOTES', name: 'Notes' }]}
      initialItems={source9AmItems as any}
      initialStartTime="9:00:00 AM"
      readOnly={true}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Choose service to diff' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Diff against service' }), { target: { value: '2' } });
  await screen.findByText('Diff: 9AM → 11:30AM');
}

describe('RunsheetTableEditorDiff HTML activity titles (#126)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();

    mockChannels.mockResolvedValue({
      success: true,
      channels: [
        { id: 1, name: 'MNL Crowne // November 15, 2026 // 9AM', time: '9AM' },
        { id: 2, name: 'MNL Crowne // November 15, 2026 // 11:30AM', time: '11:30AM' },
      ],
    });

    mockBatch.mockResolvedValue([
      {
        channelId: 2,
        success: true,
        data: {
          channelId: 2,
          name: 'MNL Crowne // November 15, 2026 // 11:30AM',
          startTime: '11:30:00 AM',
          contentChannelTypeId: 13,
          columns: [{ id: 101, key: 'NOTES', name: 'Notes' }],
          items: target1130AmItems as any,
        },
      },
    ]);
  });

  it('renders plain readable headings in All segments > Cards including ABSENT IN 11:30AM and strips XSS payloads', async () => {
    await open9AmTo1130Diff();

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    const cardsContainer = await screen.findByTestId('inline-service-diff-cards');

    const headings = Array.from(cardsContainer.querySelectorAll('h4')).map((h) => h.textContent);
    expect(headings).toEqual([
      'Runsheet Huddle',
      'All-In Huddle',
      'Worship & Prayer',
      "Pastor Rico's Q&A",
      'Safe Segment',
      'Doors Open',
    ]);

    // No raw HTML tags or entities leaked into visible text
    expect(cardsContainer.textContent).not.toContain('<p>');
    expect(cardsContainer.textContent).not.toContain('<strong>');
    expect(cardsContainer.textContent).not.toContain('&amp;');
    expect(cardsContainer.textContent).not.toContain('&nbsp;');
    expect(cardsContainer.textContent).not.toContain('&#39;');

    // Absent in 11:30AM card displays clean heading and keeps source-only status
    const absentBadge = within(cardsContainer).getByText('Absent in 11:30AM');
    const absentCard = absentBadge.closest('[data-testid="diff-card"]') as HTMLElement;
    expect(absentCard).toHaveAttribute('data-row-status', 'source-only');
    expect(absentCard.querySelector('h4')).toHaveTextContent('All-In Huddle');

    // No script, style, img, or inline event handlers injected anywhere in cards
    expect(cardsContainer.querySelector('script')).toBeNull();
    expect(cardsContainer.querySelector('style')).toBeNull();
    expect(cardsContainer.querySelector('img')).toBeNull();
    expect(cardsContainer.querySelector('[onload], [onerror], [onclick]')).toBeNull();
    expect(cardsContainer.textContent).not.toContain('alert(');

    // Changes only keeps absent & differing cards with clean headings;
    // Runsheet Huddle's title is unchanged (only START changed), so its heading is the only title rendered
    fireEvent.click(screen.getByRole('button', { name: 'Changes only' }));
    const filteredHeadings = Array.from(cardsContainer.querySelectorAll('h4')).map((h) => h.textContent);
    expect(filteredHeadings).toEqual([
      'Runsheet Huddle',
      'All-In Huddle',
      'Worship & Prayer',
      "Pastor Rico's Q&A",
      'Safe Segment',
      'Doors Open',
    ]);
    const huddleCard = within(cardsContainer).getByText('Runsheet Huddle').closest('[data-testid="diff-card"]') as HTMLElement;
    expect(huddleCard.querySelector('[data-diff-field="Activity Title"]')).not.toBeInTheDocument();

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('renders clean sanitized activity titles in Table view across All segments and Changes only', async () => {
    await open9AmTo1130Diff();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    const table = await screen.findByTestId('inline-service-diff-table');

    expect(within(table).getByText('Runsheet Huddle')).toBeInTheDocument();
    expect(within(table).getByText('All-In Huddle')).toBeInTheDocument();
    expect(within(table).getByText('Absent in 11:30AM')).toBeInTheDocument();
    expect(within(table).getByText(/Worship/)).toBeInTheDocument();
    expect(within(table).getByText("Pastor Rico's Q&A")).toBeInTheDocument();
    expect(within(table).getByText('Safe Segment')).toBeInTheDocument();
    expect(within(table).getByText('Doors Open')).toBeInTheDocument();

    expect(table.textContent).not.toContain('<p>');
    expect(table.textContent).not.toContain('<strong>');
    expect(table.querySelector('script')).toBeNull();
    expect(table.querySelector('style')).toBeNull();
    expect(table.querySelector('img')).toBeNull();
    expect(table.querySelector('[onload], [onerror], [onclick]')).toBeNull();

    // Changes only in Table view still shows All-In Huddle (Absent in 11:30AM) and Runsheet Huddle cleanly without raw HTML
    fireEvent.click(screen.getByRole('button', { name: 'Changes only' }));
    expect(within(table).getByText('All-In Huddle')).toBeInTheDocument();
    expect(within(table).getByText('Absent in 11:30AM')).toBeInTheDocument();
    expect(within(table).getByText('Runsheet Huddle')).toBeInTheDocument();
    expect(table.textContent).not.toContain('<p>');
    expect(table.textContent).not.toContain('<strong>');

    expect(mockWrite).not.toHaveBeenCalled();
  });
});
