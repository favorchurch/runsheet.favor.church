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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockDuplicateServiceRunsheet } from '@/server-actions/rockDuplicateServiceRunsheet';
import { rockBulkSaveRunsheetItems } from '@/server-actions/rockBulkSaveRunsheetItems';

const categories = [
  { id: 10, name: 'MNL | SUNDAY SERVICES' },
  { id: 20, name: 'BNE | SUNDAY SERVICES' },
  { id: 590, name: 'MNL | ALL EVENTS' },
];

function renderEditor(props: Partial<React.ComponentProps<typeof RunsheetTableEditor>> = {}) {
  return render(
    <RunsheetTableEditor
      channelId={1}
      channelName="MNL Crowne // August 9, 2026 // 10AM"
      columns={[]}
      initialItems={[]}
      initialStartTime="10:00 AM"
      canEdit
      editorMode="edit"
      {...props}
    />,
  );
}

async function openDuplicate() {
  fireEvent.click(screen.getAllByRole('button', { name: /^duplicate$/i })[0]);
  await waitFor(() => expect(screen.getByRole('heading', { name: /duplicate runsheet/i })).toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/loading options/i)).not.toBeInTheDocument());
}

function categoryNames() {
  const heading = screen.getByRole('heading', { name: /duplicate runsheet/i });
  const select = heading.parentElement!.querySelector('select')!;
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
}

describe('RunsheetTableEditor duplicate campus scope', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    (getRockContentChannelOptions as jest.Mock).mockResolvedValue({
      success: true,
      types: [{ id: 13, name: 'Service Runsheet' }],
      categories,
    });
    (rockGetScheduleOptions as jest.Mock).mockResolvedValue({ success: true, schedules: [] });
    (rockBulkSaveRunsheetItems as jest.Mock).mockResolvedValue({ success: true, results: [] });
  });

  it('offers no campus categories and refuses a campus title when runsheetCampuses is undefined', async () => {
    renderEditor({ runsheetCampuses: undefined });
    await openDuplicate();

    expect(categoryNames()).toEqual(['No Categories Available']);

    const heading = screen.getByRole('heading', { name: /duplicate runsheet/i });
    const titleInput = heading.parentElement!.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'MNL Crowne // August 16, 2026 // 10AM' } });
    fireEvent.submit(titleInput.closest('form')!);

    expect(await screen.findByText(/not authorized to create runsheets for any campus/i)).toBeInTheDocument();
    expect(rockDuplicateServiceRunsheet).not.toHaveBeenCalled();
  });

  it('offers every category to a Global user', async () => {
    renderEditor({ runsheetCampuses: ['ALL'] });
    await openDuplicate();
    expect(categoryNames()).toEqual(categories.map((c) => c.name));
  });

  it('offers only the Grow category to a Grow-only editor', async () => {
    renderEditor({ runsheetCampuses: [], growOnly: true });
    await openDuplicate();
    expect(categoryNames()).toEqual(['MNL | ALL EVENTS']);
  });
});
