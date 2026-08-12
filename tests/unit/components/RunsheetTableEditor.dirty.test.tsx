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
import { render } from '@testing-library/react';
import { RunsheetTableEditor } from '@/components/runsheet/RunsheetTableEditor';
import type { DynamicAttributeColumn, RunsheetItemRow } from '@/types/Runsheet';

describe('RunsheetTableEditor dirty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  const columns: DynamicAttributeColumn[] = [
    { id: 1, key: 'ACTIVITYTITLE', label: 'Activity', columnGroup: 'Details', order: 1, fieldType: 'text' },
    { id: 2, key: 'DESCRIPTION', label: 'Description', columnGroup: 'Details', order: 2, fieldType: 'text' },
    { id: 3, key: 'WORSHIPLEADER', label: 'Worship Leader', columnGroup: 'People', order: 3, fieldType: 'person' },
  ];

  const initialItems: RunsheetItemRow[] = [
    {
      id: 101,
      title: 'Welcome & Announcements',
      order: 1,
      startDateTime: '2026-08-16T10:00:00.000Z',
      duration: 5,
      attributeValues: { ACTIVITYTITLE: 'Welcome & Announcements', DESCRIPTION: 'Greeting the church' },
    },
    {
      id: 102,
      title: 'Praise & Worship',
      order: 2,
      startDateTime: '2026-08-16T10:05:00.000Z',
      duration: 15,
      attributeValues: { ACTIVITYTITLE: 'Praise & Worship', DESCRIPTION: '3 songs' },
    },
  ];

  test('does NOT mark editor dirty on initial render when no edits are made', () => {
    const onDirtyChange = jest.fn();

    render(
      <RunsheetTableEditor
        channelId={1}
        channelName="Sun 10:00 AM"
        columns={columns}
        initialItems={initialItems}
        initialStartTime="10:00 AM"
        onDirtyChange={onDirtyChange}
      />
    );

    // After render, onDirtyChange should have been called with false (or last call should be false)
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
