/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { rockSyncRosterRole } from '@/server-actions/rockSyncRosterRole';
import { RockRosterRolePicker } from '@/components/runsheet/RockRosterRolePicker';

jest.mock('@/server-actions/rockSyncRosterRole', () => ({ rockSyncRosterRole: jest.fn() }));
jest.mock('@/server-actions/searchRockPeople', () => ({ searchRockPeople: jest.fn(async () => []) }));

const mockSync = jest.mocked(rockSyncRosterRole);

describe('RockRosterRolePicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the remaining people to Rock when one is removed', async () => {
    mockSync.mockResolvedValueOnce({ success: true, people: [{ personId: 20, name: 'Maria Santos' }] });
    const onSaved = jest.fn();

    render(
      <RockRosterRolePicker
        channelName="MNL Crowne // December 27, 2099 // 3PM"
        roleTitle="Roster: Worship Leaders"
        initialPeople={[
          { personId: 10, name: 'Juan Dela Cruz' },
          { personId: 20, name: 'Maria Santos' },
        ]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove Juan Dela Cruz/i }));
    fireEvent.click(screen.getByRole('button', { name: /save to rock/i }));

    await waitFor(() =>
      expect(mockSync).toHaveBeenCalledWith({
        channelName: 'MNL Crowne // December 27, 2099 // 3PM',
        roleTitle: 'Roster: Worship Leaders',
        personIds: [20],
      }),
    );
    expect(onSaved).toHaveBeenCalledWith([{ personId: 20, name: 'Maria Santos' }]);
  });

  it('reverts and shows the error when Rock rejects the write', async () => {
    mockSync.mockResolvedValueOnce({
      success: false,
      people: [],
      error: 'Rock only has 2 slots for this role, but 3 people were assigned.',
    });
    const onSaved = jest.fn();

    render(
      <RockRosterRolePicker
        channelName="MNL Crowne // December 27, 2099 // 3PM"
        roleTitle="Roster: Worship Leaders"
        initialPeople={[{ personId: 10, name: 'Juan Dela Cruz' }]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove Juan Dela Cruz/i }));
    fireEvent.click(screen.getByRole('button', { name: /save to rock/i }));

    await waitFor(() => expect(screen.getByText(/only has 2 slots/i)).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });
});
