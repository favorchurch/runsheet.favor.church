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

jest.mock('@auth0/nextjs-auth0', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/server-actions/internal/rockFetch', () => ({ rockFetch: jest.fn() }));
jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({ assertAuthenticated: jest.fn() }));
jest.mock('@/auth0-hooks/server/getServerSession', () => ({ getServerSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/auth0-hooks/server/getRockSession', () => ({ getRockSession: jest.fn().mockResolvedValue({}) }));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CreateRunsheetForm } from '@/components/runsheet/CreateRunsheetForm';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';

jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/server-actions/rockCreateServiceRunsheet');
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

describe('CreateRunsheetForm Grow course creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRockContentChannelOptions as jest.Mock).mockResolvedValue({
      success: true,
      types: [{ id: 13, name: 'Service Runsheet' }],
      categories: [{ id: 338, name: 'Grow Class' }],
    });
    (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
      success: true,
      schedules: [
        {
          id: 752,
          name: 'MNL Grow - Build x FDNA',
          categoryId: 483,
          timeLabel: '3PM',
          nextDate: '2026-10-04',
          upcomingOccurrences: [
            { date: '2026-10-04', time: '3PM' },
            { date: '2026-10-11', time: '3PM' },
            { date: '2026-10-18', time: '3PM' },
          ],
        },
      ],
    });
    (rockCreateServiceRunsheet as jest.Mock).mockResolvedValue({
      success: true,
      id: 201,
      data: { channelId: 201, name: 'Created' },
    });
  });

  it('renders the course batch creation checkbox for a multi-session Grow schedule, defaulting to unchecked', async () => {
    render(<CreateRunsheetForm growOnly />);

    await waitFor(() => {
      expect(screen.getByText(/Also create runsheets for all upcoming sessions/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('(3 sessions)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Runsheet/i })).toBeInTheDocument();
  });

  it('creates only 1 runsheet when the batch checkbox is left unchecked', async () => {
    const onCreated = jest.fn();
    render(<CreateRunsheetForm growOnly onCreated={onCreated} />);

    await waitFor(() => {
      const elements = screen.getAllByDisplayValue(/MNL Grow - Build x FDNA/i);
      expect(elements.some((el) => el.tagName === 'INPUT')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Runsheet/i }));

    await waitFor(() => {
      expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(1);
    });
    expect(onCreated).toHaveBeenCalledWith(201, expect.stringContaining('MNL Grow - Build x FDNA'), expect.anything());
  });

  it('creates runsheets for all sessions when the batch checkbox is checked', async () => {
    const onCreated = jest.fn();
    render(<CreateRunsheetForm growOnly onCreated={onCreated} />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: /Create All \(3\) Runsheets/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create All \(3\) Runsheets/i }));

    await waitFor(() => {
      expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(3);
    });

    expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
      expect.stringContaining('October 4, 2026'),
      13,
      338
    );
    expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
      expect.stringContaining('October 11, 2026'),
      13,
      338
    );
    expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
      expect.stringContaining('October 18, 2026'),
      13,
      338
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
