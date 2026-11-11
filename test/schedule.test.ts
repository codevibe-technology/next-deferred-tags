import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleOnInteraction } from '../src/schedule.js';

class FakeTarget {
  listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  count() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}

function fakeTimers() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimer: (i: unknown) => {
      timers.delete(i as number);
    },
    fireAll: () => {
      for (const [k, t] of [...timers]) {
        timers.delete(k);
        t.fn();
      }
    },
  };
}

test('runs once on the first interaction and removes every listener', () => {
  const target = new FakeTarget();
  const t = fakeTimers();
  const runs: string[] = [];
  scheduleOnInteraction({ target, doc: { readyState: 'complete' }, ...t, run: (r) => runs.push(r) });
  assert.equal(t.timers.size, 1);
  target.emit('scroll');
  target.emit('keydown');
  assert.deepEqual(runs, ['scroll']);
  assert.equal(target.count(), 0);
  assert.equal(t.timers.size, 0);
});

test('falls back to the timer, which starts only after the load event', () => {
  const target = new FakeTarget();
  const t = fakeTimers();
  const runs: string[] = [];
  scheduleOnInteraction({ target, doc: { readyState: 'interactive' }, delay: 3000, ...t, run: (r) => runs.push(r) });
  assert.equal(t.timers.size, 0, 'no timer before load');
  target.emit('load');
  assert.equal([...t.timers.values()][0].ms, 3000);
  t.fireAll();
  assert.deepEqual(runs, ['timeout']);
  target.emit('pointerdown');
  assert.deepEqual(runs, ['timeout'], 'does not run twice');
});

test('delay: false waits for an interaction only', () => {
  const target = new FakeTarget();
  const t = fakeTimers();
  const runs: string[] = [];
  scheduleOnInteraction({ target, doc: { readyState: 'complete' }, delay: false, ...t, run: (r) => runs.push(r) });
  assert.equal(t.timers.size, 0);
  target.emit('touchstart');
  assert.deepEqual(runs, ['touchstart']);
});

test('custom triggers replace the defaults', () => {
  const target = new FakeTarget();
  const t = fakeTimers();
  const runs: string[] = [];
  scheduleOnInteraction({ target, doc: { readyState: 'complete' }, triggers: ['mousemove'], ...t, run: (r) => runs.push(r) });
  target.emit('scroll');
  assert.deepEqual(runs, []);
  target.emit('mousemove');
  assert.deepEqual(runs, ['mousemove']);
});

test('runNow and cancel', () => {
  const target = new FakeTarget();
  const t = fakeTimers();
  const runs: string[] = [];
  const a = scheduleOnInteraction({ target, doc: { readyState: 'complete' }, ...t, run: (r) => runs.push(r) });
  a.runNow();
  a.runNow();
  assert.deepEqual(runs, ['manual']);

  const target2 = new FakeTarget();
  const b = scheduleOnInteraction({ target: target2, doc: { readyState: 'complete' }, ...t, run: (r) => runs.push(r) });
  b.cancel();
  target2.emit('scroll');
  t.fireAll();
  assert.deepEqual(runs, ['manual']);
  assert.equal(target2.count(), 0);
});
