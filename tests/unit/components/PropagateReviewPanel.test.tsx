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
          status: 'unmatched',
          selected: false,
        },
      ],
    },
  ],
};

describe('PropagateReviewPanel', () => {
  it('shows a diverged cell with its current value and an Overwrite action', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByText(/Doors open 8:45/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /overwrite/i })).toBeInTheDocument();
  });

  it('shows an unmatched row as skipped with no action', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByText(/no matching segment.*skipped/i)).toBeInTheDocument();
  });

  it('calls onOverwrite with the target channel, item title, and column key when clicked', () => {
    const onOverwrite = jest.fn();
    render(<PropagateReviewPanel plan={plan} onOverwrite={onOverwrite} onApply={jest.fn()} applying={false} />);
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
    expect(onOverwrite).toHaveBeenCalledWith(2, 'Welcome', 'NOTES');
  });

  it('disables Apply when no cells are selected', () => {
    render(<PropagateReviewPanel plan={plan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('enables Apply once at least one cell is selected', () => {
    const selectedPlan: PropagationPlan = {
      targets: [{ ...plan.targets[0], changes: [{ ...plan.targets[0].changes[0], status: 'clean', selected: true }] }],
    };
    render(<PropagateReviewPanel plan={selectedPlan} onOverwrite={jest.fn()} onApply={jest.fn()} applying={false} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeEnabled();
  });
});
