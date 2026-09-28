/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { EventTeamRosterCard } from '@/components/runsheet/EventTeamRosterCard';
import { setRosterCollapsedPreference } from '@/lib/userPreferences';

jest.mock('@/server-actions/searchRockPeople', () => ({ searchRockPeople: jest.fn() }));

const columns = [{ key: 'PLATFORM', name: 'Platform', fieldTypeId: 15 }] as any;
const items = [
  { id: '1', title: 'Roster: Service Director', order: -100, duration: 0, attributeValues: { PLATFORM: 'Stale Name' } },
] as any;

describe('EventTeamRosterCard with Rock roster', () => {
  beforeEach(() => {
    setRosterCollapsedPreference(false);
  });

  it('prefers the Rock name over the stored value', () => {
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockRoles={[{ roleTitle: 'Roster: Service Director', people: [{ personId: 10, name: 'Juan Dela Cruz' }] }]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.queryByText('Stale Name')).not.toBeInTheDocument();
  });

  it('falls back to the stored value for a role Rock does not schedule here', () => {
    // Rock is linked for this runsheet, but this particular role has no slot in
    // it — that role must look exactly as it did before this feature existed.
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockRoles={[{ roleTitle: 'Roster: Music Director', people: [{ personId: 99, name: 'Ana Reyes' }] }]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
  });

  it('falls back to the stored value when Rock could not be read', () => {
    render(
      <EventTeamRosterCard
        items={items}
        columns={columns}
        rockLinked
        rockReadFailed
        rockRoles={[]}
        onOpenRolePicker={() => {}}
      />,
    );
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach Rock/i)).toBeInTheDocument();
  });

  it('shows the stored value unchanged on an unlinked runsheet', () => {
    render(<EventTeamRosterCard items={items} columns={columns} onOpenRolePicker={() => {}} />);
    expect(screen.getByText('Stale Name')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach Rock/i)).not.toBeInTheDocument();
  });
});
