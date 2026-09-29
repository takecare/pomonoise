import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PomodoroTimer, formatTime } from '../src/renderer/timer.js';

function setup(settings = {}) {
  let t = 0;
  const events = [];
  const timer = new PomodoroTimer(
    { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, ...settings },
    { now: () => t, emit: (type, data) => type !== 'change' && events.push([type, data]) },
  );
  return { timer, events, advance: (ms) => { t += ms; timer.tick(); } };
}
const MIN = 60_000;

test('starts idle on a full focus period', () => {
  const { timer } = setup();
  assert.deepEqual(timer.state, { phase: 'work', status: 'idle', remainingMs: 25 * MIN, totalMs: 25 * MIN, completed: 0 });
});

test('counts down, pauses and resumes without losing time', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(10 * MIN);
  timer.pause();
  advance(30 * MIN); // paused: nothing happens
  assert.equal(timer.state.remainingMs, 15 * MIN);
  timer.start();
  advance(5 * MIN);
  assert.equal(timer.state.remainingMs, 10 * MIN);
});

test('emits start once per phase, not on resume', () => {
  const { timer, events } = setup();
  timer.start(); timer.pause(); timer.start();
  assert.deepEqual(events, [['start', { phase: 'work' }]]);
});

test('work ends into a short break that auto-starts', () => {
  const { timer, events, advance } = setup();
  timer.start();
  advance(25 * MIN);
  assert.deepEqual(events.map((e) => e[0]), ['start', 'end', 'start']);
  assert.deepEqual(events[1][1], { phase: 'work', next: 'short' });
  assert.equal(timer.state.phase, 'short');
  assert.equal(timer.state.status, 'running');
  assert.equal(timer.state.completed, 1);
});

test('every 4th pomodoro is followed by a long break', () => {
  const { timer, events, advance } = setup();
  timer.start();
  for (let i = 0; i < 4; i++) {
    advance(25 * MIN);
    if (i < 3) advance(5 * MIN);
  }
  assert.equal(timer.state.phase, 'long');
  assert.deepEqual(events.filter((e) => e[0] === 'end' && e[1].phase === 'work').map((e) => e[1].next), ['short', 'short', 'short', 'long']);
});

test('autoStartNext=false waits idle for the next phase', () => {
  const { timer, advance } = setup({ autoStartNext: false });
  timer.start();
  advance(25 * MIN);
  assert.equal(timer.state.phase, 'short');
  assert.equal(timer.state.status, 'idle');
});

test('skip moves on without counting the pomodoro', () => {
  const { timer } = setup();
  timer.start();
  timer.skip();
  assert.equal(timer.state.phase, 'short');
  assert.equal(timer.state.status, 'running');
  assert.equal(timer.state.completed, 0);
  timer.skip();
  assert.equal(timer.state.phase, 'work');
});

test('reset returns to an idle first pomodoro', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(25 * MIN);
  timer.reset();
  assert.deepEqual(timer.state, { phase: 'work', status: 'idle', remainingMs: 25 * MIN, totalMs: 25 * MIN, completed: 0 });
});

test('changing durations while idle updates the display', () => {
  const { timer } = setup();
  timer.updateSettings({ workMinutes: 50 });
  assert.equal(timer.state.remainingMs, 50 * MIN);
});

test('formatTime rounds partial seconds up', () => {
  assert.equal(formatTime(25 * MIN), '25:00');
  assert.equal(formatTime(61_001), '01:02');
  assert.equal(formatTime(0), '00:00');
});
