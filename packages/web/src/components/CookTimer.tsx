import { useCountdown } from '../hooks/useCountdown';

interface CookTimerProps {
  /** Timer length in minutes (from the instruction's `timerMinutes`). */
  minutes: number;
  /** Human context for screen-reader labels, e.g. "step 3". */
  label: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format a whole number of seconds as `mm:ss`. */
function formatMMSS(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Best-effort completion cues for a hands-busy cook. Both are optional browser
 * capabilities and are wrapped so a missing/blocked API never throws — they are
 * never asserted in tests.
 */
function signalComplete(): void {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* vibration unsupported or blocked — ignore */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio unsupported or blocked — ignore */
  }
}

const BUTTON_CLASS =
  'min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 text-base font-medium ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * A self-contained, client-side countdown for a single cooking step (#102).
 * Shown only for steps that declare a `timerMinutes`. Start/Pause/Reset controls
 * carry explicit aria-labels; the running `mm:ss` text intentionally does NOT
 * announce every tick — only the completion banner (`role="alert"`) speaks.
 */
export default function CookTimer({ minutes, label }: CookTimerProps) {
  const { remainingSeconds, running, isComplete, start, pause, reset } = useCountdown(
    minutes * 60,
    signalComplete,
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <span className="font-mono text-2xl font-semibold tabular-nums" aria-hidden="true">
        {formatMMSS(remainingSeconds)}
      </span>

      {running ? (
        <button
          type="button"
          onClick={pause}
          aria-label={`Pause timer for ${label}`}
          className={`${BUTTON_CLASS} bg-amber-500 text-white hover:bg-amber-600 focus-visible:outline-amber-600`}
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={`Start ${minutes}-minute timer for ${label}`}
          className={`${BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600`}
        >
          {isComplete ? 'Restart' : 'Start'}
        </button>
      )}

      <button
        type="button"
        onClick={reset}
        aria-label={`Reset timer for ${label}`}
        className={`${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700`}
      >
        Reset
      </button>

      {isComplete && (
        <span
          role="alert"
          className="text-base font-semibold text-green-700 dark:text-green-400"
        >
          Time&rsquo;s up for {label}!
        </span>
      )}
    </div>
  );
}
