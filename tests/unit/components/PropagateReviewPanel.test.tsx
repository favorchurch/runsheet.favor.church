/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropagateReviewPanel } from '@/components/runsheet/PropagateReviewPanel';
import type { PropagationPlan } from '@/lib/runsheetPropagate';

const plan: PropagationPlan = {
  targets: [
    {
      channel: { channelId: 2, name: 'MNL Crowne // Aug 16, 2026 // 5PM', time: '5PM', preselected: true },
      changes: [
        {
          itemTitle: 'Welcome',
          columnKey: 'NOTES',
          columnName: 'Notes',
          newValue: 'Doors open 9:00',
          sourcePreviousValue: 'Doors open 8:30',
          targetCurrentValue: 'Doors open 8:45',
          targetItemId: 10,
          status: 'diverged',
          selected: false,
        },
        {
          itemTitle: 'Worship Set 2',
          columnKey: 'DURATION_TEXT',
          columnName: 'Duration',
          newValue: '10',
          sourcePreviousValue: '8',
          targetCurrentValue: null,
          targetItemId: null,
          status: 'unmatched',
          selected: false,
        },
      ],
    },
  ],
};

describe('PropagateReviewPanel', () => {
  it('shows every change with a checkbox, plain text (not raw HTML), and a diverged cell with its current value', () => {
    render(<PropagateReviewPanel plan={plan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByText(/Doors open 9:00/)).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /apply welcome notes to all services/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('renders HTML values as plain text', () => {
    const htmlPlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [{ ...plan.targets[0].changes[0], newValue: '<p><strong>Fast Songs test</strong></p>' }] }],
    };
    render(<PropagateReviewPanel plan={htmlPlan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByText('Fast Songs test')).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });

  it('renders an HTML item title (a rich-text ACTIVITYTITLE cell) as plain text too', () => {
    const htmlTitlePlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [{ ...plan.targets[0].changes[0], itemTitle: '<p><strong>Fast Songs test</strong></p>' }] }],
    };
    render(<PropagateReviewPanel plan={htmlTitlePlan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByText(/Fast Songs test/)).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });

  it('shows an unmatched row as skipped, with its group checkbox disabled if it is the only row', () => {
    const onlyUnmatchedPlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [plan.targets[0].changes[1]] }],
    };
    render(<PropagateReviewPanel plan={onlyUnmatchedPlan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByText(/no matching segment.*skipped/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /apply worship set 2 duration to all services/i })).toBeDisabled();
  });

  it('calls onToggleGroup with the item title, column key, and next selected state when checked', () => {
    const onToggleGroup = jest.fn();
    render(<PropagateReviewPanel plan={plan} onToggleGroup={onToggleGroup} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /apply welcome notes to all services/i }));
    expect(onToggleGroup).toHaveBeenCalledWith('Welcome', 'NOTES', true);
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = jest.fn();
    render(<PropagateReviewPanel plan={plan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={onClose} applying={false} />);
    fireEvent.click(screen.getByRole('button', { name: /close review/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Apply when no cells are selected', () => {
    render(<PropagateReviewPanel plan={plan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('enables Apply once at least one cell is selected', () => {
    const selectedPlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [{ ...plan.targets[0].changes[0], status: 'clean', selected: true }] }],
    };
    render(<PropagateReviewPanel plan={selectedPlan} onToggleGroup={jest.fn()} onApply={jest.fn()} onClose={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeEnabled();
  });
});
