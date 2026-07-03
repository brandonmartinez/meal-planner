import { vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CookTimer from './CookTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** userEvent bound to the fake timer clock so clicks resolve deterministically. */
function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('CookTimer', () => {
  it('shows the full duration as mm:ss with a start control', () => {
    render(<CookTimer minutes={10} label="step 1" />);

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start 10-minute timer for step 1' }),
    ).toBeInTheDocument();
  });

  it('counts down and swaps Start for Pause while running', async () => {
    const user = setupUser();
    render(<CookTimer minutes={1} label="step 2" />);

    await user.click(screen.getByRole('button', { name: /start 1-minute timer/i }));

    expect(
      screen.getByRole('button', { name: 'Pause timer for step 2' }),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('00:55')).toBeInTheDocument();
  });

  it('announces completion when the countdown reaches zero', async () => {
    const user = setupUser();
    render(<CookTimer minutes={1} label="step 3" />);

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => vi.advanceTimersByTime(60000));

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/time.+up for step 3/i);
    // Once complete, the primary action offers a restart.
    expect(screen.getByRole('button', { name: /start 1-minute timer/i })).toHaveTextContent(
      'Restart',
    );
  });
});
