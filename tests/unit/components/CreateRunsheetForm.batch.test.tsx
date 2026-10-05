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
import { CreateRunsheetForm, sessionBaseName } from '@/components/runsheet/CreateRunsheetForm';
import { getRockContentChannelOptions } from '@/server-actions/getRockContentChannelOptions';
import { rockGetScheduleOptions } from '@/server-actions/rockGetScheduleOptions';
import { rockCreateServiceRunsheet } from '@/server-actions/rockCreateServiceRunsheet';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';
import toast from 'react-hot-toast';

jest.mock('@/server-actions/getRockContentChannelOptions');
jest.mock('@/server-actions/rockGetScheduleOptions');
jest.mock('@/server-actions/rockCreateServiceRunsheet');
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels');
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const mockCategories = [
  { id: 10, name: 'MNL | SUNDAY SERVICES' },
  { id: 20, name: 'BNE | SUNDAY SERVICES' },
  { id: 590, name: 'MNL | ALL EVENTS' },
];

const mockMultiSchedules = [
  {
    id: 101,
    name: 'MNL Crowne 9AM',
    categoryId: 10,
    timeLabel: '9AM',
    nextDate: '2026-10-11',
    upcomingOccurrences: [
      { date: '2026-10-11', time: '9AM' },
      { date: '2026-10-18', time: '9AM' },
      { date: '2026-10-25', time: '9AM' },
      { date: '2026-11-01', time: '9AM' },
      { date: '2026-11-08', time: '9AM' },
    ],
  },
  {
    id: 102,
    name: 'MNL Crowne 11AM',
    categoryId: 10,
    timeLabel: '11AM',
    nextDate: '2026-10-11',
    upcomingOccurrences: [
      { date: '2026-10-11', time: '11AM' },
      { date: '2026-10-18', time: '11AM' },
    ],
  },
  {
    id: 103,
    name: 'MNL Crowne 3PM',
    categoryId: 10,
    timeLabel: '3PM',
    nextDate: '2026-10-11',
    upcomingOccurrences: [
      { date: '2026-10-11', time: '3PM' },
    ],
  },
];

describe('CreateRunsheetForm batch operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRockContentChannelOptions as jest.Mock).mockResolvedValue({
      success: true,
      types: [{ id: 13, name: 'Service Runsheet' }],
      categories: mockCategories,
    });
    (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
      success: true,
      schedules: mockMultiSchedules,
    });
    (rockCreateServiceRunsheet as jest.Mock).mockResolvedValue({
      success: true,
      id: 501,
      data: { channelId: 501, name: 'Created' },
    });
    (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
      success: true,
      channels: [
        { id: 401, name: 'MNL Crowne // October 11, 2026 // 9AM', time: '9AM' },
        { id: 402, name: 'MNL Crowne // October 11, 2026 // 11AM', time: '11AM' },
      ],
    });
  });

  describe('Date-wide batch checkbox', () => {
    it('only includes sessions of the selected service (same name, different time) on that date', async () => {
      const onDate = (id: number, name: string, time: string) => ({
        id,
        name,
        categoryId: 10,
        timeLabel: time,
        nextDate: '2026-10-11',
        upcomingOccurrences: [{ date: '2026-10-11', time }],
      });
      (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
        success: true,
        schedules: [
          onDate(301, 'MNL Crowne 9AM', '9AM'),
          onDate(302, 'MNL Sunday AM Huddle', '7AM'),
          onDate(303, 'MNL Crowne 11:30AM', '11:30AM'),
          onDate(304, 'MNL Crowne 9AM - Kids', '9AM'),
          onDate(305, 'MNL Filoil 3PM', '3PM'),
          onDate(306, 'MNL Crowne 5:30PM', '5:30PM'),
        ],
      });

      render(<CreateRunsheetForm />);

      const sessionSelect = await screen.findByRole('combobox', { name: /Session \/ Service Schedule/i });
      await waitFor(() => expect(sessionSelect).toHaveValue('MNL Crowne 9AM'));

      fireEvent.click(await screen.findByLabelText(/Create runsheets for all 3 sessions on this date/i));
      fireEvent.click(screen.getByRole('button', { name: /Create All \(3\) Runsheets/i }));

      await waitFor(() => expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(3));
      const titles = (rockCreateServiceRunsheet as jest.Mock).mock.calls.map((c) => c[0]);
      expect(titles.some((t: string) => t.includes('9AM'))).toBe(true);
      expect(titles.some((t: string) => t.includes('11:30AM'))).toBe(true);
      expect(titles.some((t: string) => t.includes('5:30PM'))).toBe(true);
      expect(titles.some((t: string) => /Kids|Huddle|Filoil/i.test(t))).toBe(false);
    });

    it('hides the date-wide checkbox when the selected service has no other session that date', async () => {
      (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
        success: true,
        schedules: [
          { id: 311, name: 'MNL Sunday AM Huddle', categoryId: 10, timeLabel: '7AM', nextDate: '2026-10-11', upcomingOccurrences: [{ date: '2026-10-11', time: '7AM' }] },
          { id: 312, name: 'MNL Crowne 9AM', categoryId: 10, timeLabel: '9AM', nextDate: '2026-10-11', upcomingOccurrences: [{ date: '2026-10-11', time: '9AM' }] },
          { id: 313, name: 'MNL Crowne 3PM', categoryId: 10, timeLabel: '3PM', nextDate: '2026-10-11', upcomingOccurrences: [{ date: '2026-10-11', time: '3PM' }] },
        ],
      });

      render(<CreateRunsheetForm />);

      const sessionSelect = await screen.findByRole('combobox', { name: /Session \/ Service Schedule/i });
      fireEvent.change(sessionSelect, { target: { value: 'MNL Sunday AM Huddle' } });
      await waitFor(() => expect(sessionSelect).toHaveValue('MNL Sunday AM Huddle'));
      expect(screen.queryByText(/Create runsheets for all.*sessions on this date/i)).not.toBeInTheDocument();

      fireEvent.change(sessionSelect, { target: { value: 'MNL Crowne 3PM' } });
      expect(await screen.findByLabelText(/Create runsheets for all 2 sessions on this date/i)).toBeInTheDocument();
    });

    it('appears when schedules.length >= 2, and updates the submit button label when checked', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      const dateWideCheckbox = screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i);
      expect(dateWideCheckbox).not.toBeChecked();
      expect(screen.getByRole('button', { name: /Save Runsheet/i })).toBeInTheDocument();

      fireEvent.click(dateWideCheckbox);
      expect(dateWideCheckbox).toBeChecked();
      expect(screen.getByRole('button', { name: /Create All \(3\) Runsheets/i })).toBeInTheDocument();
    });

    it('does not appear when schedules.length < 2', async () => {
      (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
        success: true,
        schedules: [mockMultiSchedules[0]],
      });

      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(/MNL Crowne 9AM/i)).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/Create runsheets for all.*sessions on this date/i)
      ).not.toBeInTheDocument();
    });

    it('creates runsheets for all schedules on that date with skipIfExists: true and auto-titles', async () => {
      const onCreated = jest.fn();
      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i));
      fireEvent.click(screen.getByRole('button', { name: /Create All \(3\) Runsheets/i }));

      await waitFor(() => {
        expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(3);
      });

      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('9AM'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('11AM'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('3PM'),
        13,
        10,
        { skipIfExists: true }
      );

      expect(onCreated).toHaveBeenCalledWith(501, expect.stringContaining('9AM'), expect.anything());
    });

    it('only includes schedules occurring on the chosen date and excludes schedules from other dates', async () => {
      (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
        success: true,
        schedules: [
          {
            id: 201,
            name: 'MNL Crowne 9AM',
            categoryId: 10,
            timeLabel: '9AM',
            nextDate: '2026-10-11',
            upcomingOccurrences: [
              { date: '2026-10-11', time: '9AM' },
            ],
          },
          {
            id: 202,
            name: 'MNL Crowne 11AM',
            categoryId: 10,
            timeLabel: '11AM',
            nextDate: '2026-10-11',
            upcomingOccurrences: [
              { date: '2026-10-11', time: '11AM' },
            ],
          },
          {
            id: 203,
            name: 'MNL Saturday Meeting 5PM',
            categoryId: 10,
            timeLabel: '5PM',
            nextDate: '2026-10-17',
            upcomingOccurrences: [
              { date: '2026-10-17', time: '5PM' },
            ],
          },
        ],
      });

      render(<CreateRunsheetForm />);

      // On 2026-10-11 (next Sunday), only 2 of the 3 schedules occur
      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 2 sessions on this date/i)
        ).toBeInTheDocument();
      });

      // It should NOT count 3 sessions
      expect(
        screen.queryByLabelText(/Create runsheets for all 3 sessions on this date/i)
      ).not.toBeInTheDocument();

      const checkbox = screen.getByLabelText(/Create runsheets for all 2 sessions on this date/i);
      fireEvent.click(checkbox);

      // Button should say Create All (2) Runsheets
      expect(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(2);
      });

      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('9AM'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('11AM'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).not.toHaveBeenCalledWith(
        expect.stringContaining('Saturday Meeting'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('does not display the date-wide checkbox when only 1 schedule occurs on the chosen date despite multiple total schedules', async () => {
      (rockGetScheduleOptions as jest.Mock).mockResolvedValue({
        success: true,
        schedules: [
          {
            id: 301,
            name: 'MNL Grow - Topic A',
            categoryId: 483,
            timeLabel: '3PM',
            nextDate: '2026-10-11',
            upcomingOccurrences: [
              { date: '2026-10-11', time: '3PM' },
            ],
          },
          {
            id: 302,
            name: 'MNL Grow - Topic B',
            categoryId: 483,
            timeLabel: '3PM',
            nextDate: '2026-10-18',
            upcomingOccurrences: [
              { date: '2026-10-18', time: '3PM' },
            ],
          },
        ],
      });

      render(<CreateRunsheetForm growOnly />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(/MNL Grow - Topic A/i)).toBeInTheDocument();
      });

      // Date-wide batch should NOT appear because only 1 topic occurs on 2026-10-11
      expect(
        screen.queryByText(/Create runsheets for all.*sessions on this date/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Non-Grow upcoming batch with count', () => {
    it('appears for non-Grow schedule with >= 2 upcoming occurrences, defaulting to min(4, occurrences)', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Also create runsheets for upcoming sessions/i)
        ).toBeInTheDocument();
      });

      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);
      expect(upcomingCheckbox).not.toBeChecked();

      const countInput = screen.getByLabelText(/Upcoming sessions count/i) as HTMLInputElement;
      expect(countInput).toBeInTheDocument();
      expect(countInput.value).toBe('4'); // 5 occurrences available, default is 4

      fireEvent.click(upcomingCheckbox);
      expect(screen.getByRole('button', { name: /Create All \(4\) Runsheets/i })).toBeInTheDocument();
    });

    it('allows changing count input clamped between 1 and available occurrences', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);
      fireEvent.click(upcomingCheckbox);

      const countInput = screen.getByLabelText(/Upcoming sessions count/i);

      // Change to 2
      fireEvent.change(countInput, { target: { value: '2' } });
      expect(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i })).toBeInTheDocument();

      // Change beyond max (available is 5) -> clamps to 5
      fireEvent.change(countInput, { target: { value: '99' } });
      expect(screen.getByRole('button', { name: /Create All \(5\) Runsheets/i })).toBeInTheDocument();

      // Change below 1 -> clamps to 1
      fireEvent.change(countInput, { target: { value: '0' } });
      expect(screen.getByRole('button', { name: /Create All \(1\) Runsheets/i })).toBeInTheDocument();
    });

    it('submits exactly the earliest count of occurrences with skipIfExists: true', async () => {
      const onCreated = jest.fn();
      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(2);
      });

      // Earliest 2 dates are 2026-10-11 and 2026-10-18
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('October 11, 2026'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('October 18, 2026'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    it('does not show upcoming batch when occurrences < 2', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(/MNL Crowne 9AM/i)).toBeInTheDocument();
      });

      // Switch session to MNL Crowne 3PM which has only 1 upcoming occurrence
      const sessionSelect = screen.getByRole('combobox', { name: /Session \/ Service Schedule/i });
      fireEvent.change(sessionSelect, { target: { value: 'MNL Crowne 3PM' } });

      await waitFor(() => {
        expect(
          screen.queryByLabelText(/Also create runsheets for upcoming sessions/i)
        ).not.toBeInTheDocument();
      });
    });

    it('starts non-Grow upcoming batch at the chosen date and creates subsequent occurrences from that date', async () => {
      const onCreated = jest.fn();
      const { container } = render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(/MNL Crowne 9AM/i)).toBeInTheDocument();
      });

      // Change date to 2026-10-25 (occurrences on or after: 2026-10-25, 2026-11-01, 2026-11-08)
      const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: '2026-10-25' } });

      await waitFor(() => {
        expect(screen.getByText('(3 sessions available)')).toBeInTheDocument();
      });

      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);
      fireEvent.click(upcomingCheckbox);

      const countInput = screen.getByLabelText(/Upcoming sessions count/i) as HTMLInputElement;
      expect(countInput.max).toBe('3');

      // Set count to 2
      fireEvent.change(countInput, { target: { value: '2' } });
      expect(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(rockCreateServiceRunsheet).toHaveBeenCalledTimes(2);
      });

      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('October 25, 2026'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).toHaveBeenCalledWith(
        expect.stringContaining('November 1, 2026'),
        13,
        10,
        { skipIfExists: true }
      );
      expect(rockCreateServiceRunsheet).not.toHaveBeenCalledWith(
        expect.stringContaining('October 11, 2026'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(rockCreateServiceRunsheet).not.toHaveBeenCalledWith(
        expect.stringContaining('October 18, 2026'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Mutual exclusion and resets', () => {
    it('clears Date-wide when Upcoming is checked, and clears Upcoming when Date-wide is checked', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      const dateWideCheckbox = screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i);
      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);

      // Check date-wide
      fireEvent.click(dateWideCheckbox);
      expect(dateWideCheckbox).toBeChecked();
      expect(upcomingCheckbox).not.toBeChecked();

      // Check upcoming -> date-wide should be cleared
      fireEvent.click(upcomingCheckbox);
      expect(upcomingCheckbox).toBeChecked();
      expect(dateWideCheckbox).not.toBeChecked();

      // Check date-wide again -> upcoming should be cleared
      fireEvent.click(dateWideCheckbox);
      expect(dateWideCheckbox).toBeChecked();
      expect(upcomingCheckbox).not.toBeChecked();
    });

    it('resets both checkboxes when session changes', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      const dateWideCheckbox = screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i);
      fireEvent.click(dateWideCheckbox);
      expect(dateWideCheckbox).toBeChecked();

      const sessionSelect = screen.getByRole('combobox', { name: /Session \/ Service Schedule/i });
      fireEvent.change(sessionSelect, { target: { value: 'MNL Crowne 11AM' } });

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).not.toBeChecked();
        expect(
          screen.getByLabelText(/Also create runsheets for upcoming sessions/i)
        ).not.toBeChecked();
      });
    });

    it('resets both checkboxes when category changes', async () => {
      render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);
      fireEvent.click(upcomingCheckbox);
      expect(upcomingCheckbox).toBeChecked();

      const categorySelect = screen.getByRole('combobox', { name: /Category/i });
      fireEvent.change(categorySelect, { target: { value: '20' } });

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Also create runsheets for upcoming sessions/i)
        ).not.toBeChecked();
      });
    });

    it('resets Date-wide batch when date changes, but preserves upcoming batch', async () => {
      const { container } = render(<CreateRunsheetForm />);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).toBeInTheDocument();
      });

      const upcomingCheckbox = screen.getByLabelText(/Also create runsheets for upcoming sessions/i);
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);

      // Check upcoming and set count to 2
      fireEvent.click(upcomingCheckbox);
      fireEvent.change(countInput, { target: { value: '2' } });
      expect(upcomingCheckbox).toBeChecked();
      expect(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i })).toBeInTheDocument();

      // Change date
      const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: '2026-10-18' } });

      // Wait for schedules to reload for the new date (2 sessions on 2026-10-18)
      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 2 sessions on this date/i)
        ).toBeInTheDocument();
      });
      expect(upcomingCheckbox).toBeChecked();
      expect(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i })).toBeInTheDocument();

      // Now check date-wide
      const dateWideCheckbox = screen.getByLabelText(/Create runsheets for all 2 sessions on this date/i);
      fireEvent.click(dateWideCheckbox);
      expect(dateWideCheckbox).toBeChecked();
      expect(upcomingCheckbox).not.toBeChecked();

      // Change date again -> date-wide should reset
      fireEvent.change(dateInput, { target: { value: '2026-10-11' } });

      await waitFor(() => {
        expect(
          screen.getByLabelText(/Create runsheets for all 3 sessions on this date/i)
        ).not.toBeChecked();
      });
    });
  });

  describe('Skip reporting, onCreated, and error handling', () => {
    it('reports created and skipped counts (naming skipped titles), and onCreated opens the first created runsheet', async () => {
      const onCreated = jest.fn();
      // First call succeeds with creation, second call is skipped
      (rockCreateServiceRunsheet as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          id: 701,
          data: { channelId: 701, name: 'Created Title 1' },
        })
        .mockResolvedValueOnce({
          success: true,
          skipped: true,
          id: 702,
        });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(screen.getByText(/Created 1, skipped 1/i)).toBeInTheDocument();
      });

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/Created 1, skipped 1 \(.*October 18, 2026.*\), failed 0\./)
      );

      // Opens the first created runsheet (701)
      expect(onCreated).toHaveBeenCalledWith(701, expect.stringContaining('October 11, 2026'), expect.anything());
    });

    it('when everything already exists, reports 0 created and skipped count, and opens the first skipped existing runsheet', async () => {
      const onCreated = jest.fn();
      (rockCreateServiceRunsheet as jest.Mock).mockResolvedValue({
        success: true,
        skipped: true,
        id: 888,
      });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(screen.getByText(/All runsheets already exist/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Created 0, skipped 2/i)).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/All runsheets already exist\. Created 0, skipped 2.*, failed 0\./)
      );

      // Opens the first skipped runsheet (888)
      expect(onCreated).toHaveBeenCalledWith(888, expect.stringContaining('October 11, 2026'));
    });

    it('resolves channel ID via rockGetAvailableRunsheetChannels when skipped response has no id', async () => {
      const onCreated = jest.fn();
      (rockCreateServiceRunsheet as jest.Mock).mockResolvedValue({
        success: true,
        skipped: true,
      });
      (rockGetAvailableRunsheetChannels as jest.Mock).mockResolvedValue({
        success: true,
        channels: [
          { id: 444, name: 'MNL Crowne // October 11, 2026 // 9AM', time: '9AM' },
        ],
      });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '1' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(1\) Runsheets/i }));

      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledWith(444, 'MNL Crowne // October 11, 2026 // 9AM');
      });
    });

    it('shows error and does not call onCreated when all items fail', async () => {
      const onCreated = jest.fn();
      (rockCreateServiceRunsheet as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Campus unauthorized',
      });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to create runsheets \(2 failed\)/i)).toBeInTheDocument();
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to create runsheets (2 failed).');
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('reports partial failure with skipped and failed items, naming failed titles with error toast and banner', async () => {
      const onCreated = jest.fn();
      (rockCreateServiceRunsheet as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          skipped: true,
          id: 701,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Rock network timeout',
        });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(screen.getByText(/Created 0, skipped 1/i)).toBeInTheDocument();
      });

      expect(screen.queryByText(/All runsheets already exist/i)).not.toBeInTheDocument();
      expect(screen.getByText(/failed 1 \(.*October 18, 2026.*\)/i)).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Created 0, skipped 1 \(.*October 11, 2026.*\), failed 1 \(.*October 18, 2026.*\)\./)
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(701, expect.stringContaining('October 11, 2026'));
    });

    it('reports partial failure with created and failed items, naming failed titles with error toast and banner', async () => {
      const onCreated = jest.fn();
      (rockCreateServiceRunsheet as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          id: 702,
          data: { channelId: 702, name: 'Created Title' },
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Unauthorized',
        });

      render(<CreateRunsheetForm onCreated={onCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Upcoming sessions count/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Also create runsheets for upcoming sessions/i));
      const countInput = screen.getByLabelText(/Upcoming sessions count/i);
      fireEvent.change(countInput, { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /Create All \(2\) Runsheets/i }));

      await waitFor(() => {
        expect(screen.getByText(/Created 1, skipped 0, failed 1/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/failed 1 \(.*October 18, 2026.*\)/i)).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Created 1, skipped 0, failed 1 \(.*October 18, 2026.*\)\./)
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(702, expect.stringContaining('October 11, 2026'), expect.anything());
    });
  });
});

describe('sessionBaseName', () => {
  it.each([
    ['MNL Crowne 9AM', 'MNL Crowne'],
    ['MNL Crowne 11:30AM', 'MNL Crowne'],
    ['MNL Crowne 5:30 PM', 'MNL Crowne'],
    ['MNL Crowne 9AM - Kids', 'MNL Crowne - Kids'],
    ['BNE 10AM Service', 'BNE Service'],
    ['MNL 4PM Saturday Youth', 'MNL Saturday Youth'],
    ['MNL Sunday AM Huddle', 'MNL Sunday AM Huddle'],
  ])('%s -> %s', (name, base) => {
    expect(sessionBaseName(name)).toBe(base);
  });
});
