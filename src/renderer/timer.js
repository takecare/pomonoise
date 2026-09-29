// Pure pomodoro state machine. No DOM, no Electron: the clock is injected so it
// can be unit-tested. Call tick() periodically; it emits events via `emit`.

export const DEFAULT_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: true,
};

const MINUTE = 60_000;

export class PomodoroTimer {
  #settings;
  #now;
  #emit;
  #phase = 'work'; // 'work' | 'short' | 'long'
  #status = 'idle'; // 'idle' | 'running' | 'paused'
  #remaining;
  #endsAt = 0;
  #completed = 0;
  #lastSecond = -1;

  constructor(settings = {}, { now = Date.now, emit = () => {} } = {}) {
    this.#settings = { ...DEFAULT_SETTINGS, ...settings };
    this.#now = now;
    this.#emit = emit;
    this.#remaining = this.#duration('work');
  }

  get state() {
    return {
      phase: this.#phase,
      status: this.#status,
      remainingMs: this.#remaining,
      totalMs: this.#duration(this.#phase),
      completed: this.#completed,
    };
  }

  get settings() {
    return { ...this.#settings };
  }

  updateSettings(patch) {
    this.#settings = { ...this.#settings, ...patch };
    if (this.#status === 'idle') this.#remaining = this.#duration(this.#phase);
    this.#changed();
  }

  start() {
    if (this.#status === 'running') return;
    if (this.#status === 'idle') this.#remaining = this.#duration(this.#phase);
    const wasIdle = this.#status === 'idle';
    this.#status = 'running';
    this.#endsAt = this.#now() + this.#remaining;
    if (wasIdle) this.#emit('start', { phase: this.#phase });
    this.#changed();
  }

  pause() {
    if (this.#status !== 'running') return;
    this.#remaining = Math.max(0, this.#endsAt - this.#now());
    this.#status = 'paused';
    this.#changed();
  }

  toggle() {
    if (this.#status === 'running') this.pause();
    else this.start();
  }

  reset() {
    this.#status = 'idle';
    this.#phase = 'work';
    this.#completed = 0;
    this.#remaining = this.#duration('work');
    this.#changed();
  }

  // Jump to the next phase without counting the current pomodoro.
  skip() {
    const wasRunning = this.#status === 'running';
    const next = this.#phase === 'work' ? this.#breakAfter(this.#completed) : 'work';
    this.#enter(next, wasRunning);
  }

  tick() {
    if (this.#status !== 'running') return;
    this.#remaining = Math.max(0, this.#endsAt - this.#now());
    if (this.#remaining === 0) {
      this.#finish();
      return;
    }
    const second = Math.ceil(this.#remaining / 1000);
    if (second !== this.#lastSecond) this.#changed();
  }

  #finish() {
    const ended = this.#phase;
    if (ended === 'work') this.#completed++;
    const next = ended === 'work' ? this.#breakAfter(this.#completed - 1) : 'work';
    this.#emit('end', { phase: ended, next });
    this.#enter(next, this.#settings.autoStartNext);
  }

  // Which break follows a pomodoro, given how many were completed before it.
  #breakAfter(completedBefore) {
    return (completedBefore + 1) % this.#settings.longBreakEvery === 0 ? 'long' : 'short';
  }

  #enter(phase, run) {
    this.#phase = phase;
    this.#remaining = this.#duration(phase);
    this.#status = 'idle';
    if (run) this.start();
    else this.#changed();
  }

  #duration(phase) {
    const s = this.#settings;
    const minutes = { work: s.workMinutes, short: s.shortBreakMinutes, long: s.longBreakMinutes }[phase];
    return minutes * MINUTE;
  }

  #changed() {
    this.#lastSecond = Math.ceil(this.#remaining / 1000);
    this.#emit('change', this.state);
  }
}

export function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
