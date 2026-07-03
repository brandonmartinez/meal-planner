import { useCallback, useEffect, useRef, useState } from 'react';

export interface Countdown {
  /** Seconds left on the clock (never negative). */
  remainingSeconds: number;
  /** Whether the countdown is actively ticking. */
  running: boolean;
  /** True once the countdown has reached zero. */
  isComplete: boolean;
  /** Start (or resume) ticking. Restarts from the full duration if complete. */
  start: () => void;
  /** Pause ticking without losing the remaining time. */
  pause: () => void;
  /** Stop and restore the full duration. */
  reset: () => void;
}

/**
 * A purely client-side countdown timer (#102 cooking mode). Ticks once per
 * second via `setInterval` while `running`, clearing the interval on pause and
 * on unmount. `onComplete` fires once when the clock transitions to zero.
 *
 * No server state is involved — the timer lives only in component state and
 * resets on refresh/unmount, matching the "local timers only" constraint.
 */
export function useCountdown(totalSeconds: number, onComplete?: () => void): Countdown {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [running, setRunning] = useState(false);

  // Keep the latest callback without making it a tick/effect dependency, so a
  // caller passing an inline arrow doesn't restart the interval every render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // If the source duration changes (e.g. a different step), reset the clock.
  useEffect(() => {
    setRemainingSeconds(totalSeconds);
    setRunning(false);
  }, [totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemainingSeconds(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Stop and notify exactly once when the clock hits zero while running.
  useEffect(() => {
    if (running && remainingSeconds === 0) {
      setRunning(false);
      onCompleteRef.current?.();
    }
  }, [running, remainingSeconds]);

  const start = useCallback(() => {
    setRemainingSeconds(prev => (prev <= 0 ? totalSeconds : prev));
    setRunning(true);
  }, [totalSeconds]);

  const pause = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    setRunning(false);
    setRemainingSeconds(totalSeconds);
  }, [totalSeconds]);

  return {
    remainingSeconds,
    running,
    isComplete: remainingSeconds === 0,
    start,
    pause,
    reset,
  };
}
