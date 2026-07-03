import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('starts idle at the full duration', () => {
    const { result } = renderHook(() => useCountdown(90));

    expect(result.current.remainingSeconds).toBe(90);
    expect(result.current.running).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it('decrements one second per tick while running', () => {
    const { result } = renderHook(() => useCountdown(10));

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.remainingSeconds).toBe(7);
  });

  it('pauses without losing the remaining time', () => {
    const { result } = renderHook(() => useCountdown(10));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.pause());

    expect(result.current.running).toBe(false);
    expect(result.current.remainingSeconds).toBe(8);

    // No further ticks after pausing.
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remainingSeconds).toBe(8);
  });

  it('reset restores the full duration and stops', () => {
    const { result } = renderHook(() => useCountdown(10));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.reset());

    expect(result.current.running).toBe(false);
    expect(result.current.remainingSeconds).toBe(10);
  });

  it('fires onComplete exactly once when the clock reaches zero', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useCountdown(3, onComplete));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.running).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Advancing further must not re-fire completion.
    act(() => vi.advanceTimersByTime(5000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
