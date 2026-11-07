import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadingSpinner, EmptyState, ErrorAlert } from '../components/StateFeedback';

describe('StateFeedback Components (AC-UI-05)', () => {
  it('renders LoadingSpinner with default and custom message', () => {
    const { rerender } = render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading.../i);

    rerender(<LoadingSpinner message="Fetching goals..." />);
    expect(screen.getByRole('status')).toHaveTextContent(/Fetching goals.../i);
  });

  it('renders EmptyState with message and action button', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        message="No goals set yet"
        action={<button onClick={onAction}>Create Goal</button>}
      />
    );

    expect(screen.getByTestId('empty-state')).toHaveTextContent('No goals set yet');
    const button = screen.getByRole('button', { name: /Create Goal/i });
    expect(button).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders ErrorAlert with retry option', async () => {
    const onRetry = vi.fn();
    render(<ErrorAlert message="Failed to load items" onRetry={onRetry} />);

    expect(screen.getByTestId('error-alert')).toHaveTextContent('Failed to load items');
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

