import { vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import CookTimer from './CookTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CookTimer', () => {
  it('shows the full duration as mm:ss with a start control', () => {
    render(<CookTimer minutes={10} label="step 1" />);

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start 10-minute timer for step 1' }),
    ).toBeInTheDocument();
  });

  it('counts down and swaps Start for Pause while running', () => {
    render(<CookTimer minutes={1} label="step 2" />);

    // fireEvent (not userEvent) — deterministic with fake timers; auto-wrapped in act.
    fireEvent.click(screen.getByRole('button', { name: /start 1-minute timer/i }));

    expect(
      screen.getByRole('button', { name: 'Pause timer for step 2' }),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('00:55')).toBeInTheDocument();
  });

  it('announces completion when the countdown reaches zero', () => {
    render(<CookTimer minutes={1} label="step 3" />);

    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    act(() => vi.advanceTimersByTime(60000));

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/time.+up for step 3/i);
    // Once complete, the primary action offers a restart.
    expect(screen.getByRole('button', { name: /start 1-minute timer/i })).toHaveTextContent(
      'Restart',
    );
  });
});
