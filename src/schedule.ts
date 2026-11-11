/**
 * Run a callback once: on the visitor's first interaction, or a fixed time after the
 * window `load` event, whichever comes first. Framework-free so it can be tested
 * without a browser.
 */

export const DEFAULT_TRIGGERS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
export const DEFAULT_DELAY_MS = 5000;

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions | boolean): void;
}

export interface ScheduleOptions {
  /** Events on `target` that count as an interaction. */
  triggers?: readonly string[];
  /** Milliseconds after `load` to run anyway. `false` waits for an interaction only. */
  delay?: number | false;
  /** Usually `window`. */
  target: EventTargetLike;
  /** Usually `document`; only `readyState` is read. */
  doc: { readyState: string };
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** Called once with what caused it: the event name, `"timeout"` or `"manual"`. */
  run: (reason: string) => void;
}

export interface Scheduled {
  /** Run now if it has not run yet (for example after cookie consent). */
  runNow: () => void;
  /** Remove listeners and timers without running. */
  cancel: () => void;
}

export function scheduleOnInteraction(opts: ScheduleOptions): Scheduled {
  const triggers = opts.triggers ?? DEFAULT_TRIGGERS;
  const delay = opts.delay === undefined ? DEFAULT_DELAY_MS : opts.delay;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let done = false;
  let timer: unknown;

  const listeners = triggers.map((type) => {
    const fn = () => fire(type);
    return { type, fn };
  });

  function cleanup() {
    for (const { type, fn } of listeners) opts.target.removeEventListener(type, fn, { capture: true });
    opts.target.removeEventListener('load', startTimer);
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }

  function fire(reason: string) {
    if (done) return;
    done = true;
    cleanup();
    opts.run(reason);
  }

  function startTimer() {
    if (done || delay === false || timer !== undefined) return;
    timer = setTimer(() => fire('timeout'), delay);
  }

  for (const { type, fn } of listeners) opts.target.addEventListener(type, fn, { once: true, passive: true, capture: true });
  if (opts.doc.readyState === 'complete') startTimer();
  else opts.target.addEventListener('load', startTimer, { once: true });

  return {
    runNow: () => fire('manual'),
    cancel: () => {
      if (done) return;
      done = true;
      cleanup();
    },
  };
}
