// Generated chimes: bell-like tones built from a few sine partials with
// exponentially decaying envelopes. No audio files.

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77 };

// Start: a short rising pair ("go"). End: a longer falling triad that settles ("done").
const CHIMES = {
  start: [
    { freq: NOTE.E5, at: 0, decay: 1.4 },
    { freq: NOTE.B5, at: 0.16, decay: 1.6 },
  ],
  end: [
    { freq: NOTE.G5, at: 0, decay: 1.8 },
    { freq: NOTE.E5, at: 0.28, decay: 1.8 },
    { freq: NOTE.C5, at: 0.56, decay: 2.6 },
  ],
};

// Inharmonic partial ratios and their relative level / decay, roughly like a small bell.
const PARTIALS = [
  { ratio: 1, gain: 1, decayScale: 1 },
  { ratio: 2.76, gain: 0.3, decayScale: 0.5 },
  { ratio: 5.4, gain: 0.1, decayScale: 0.25 },
];

const NOTE_GAIN = 0.5;
const OUTPUT_GAIN = 0.3;
const ATTACK_S = 0.005;
const SILENCE = 0.0001;

export const CHIME_KINDS = Object.keys(CHIMES);

export function chimeNotes(kind) {
  if (!CHIMES[kind]) throw new Error(`Unknown chime: ${kind}`);
  return CHIMES[kind].map((n) => ({ ...n }));
}

export function chimeDuration(kind) {
  return Math.max(...chimeNotes(kind).map((n) => n.at + n.decay));
}

// Schedule a chime on any (Offline)AudioContext, starting at `when`.
export function scheduleChime(ctx, destination, kind, when = ctx.currentTime) {
  const out = ctx.createGain();
  out.gain.value = OUTPUT_GAIN;
  out.connect(destination);
  for (const note of chimeNotes(kind)) {
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.frequency.value = note.freq * p.ratio;
      const env = ctx.createGain();
      const t0 = when + note.at;
      const decay = note.decay * p.decayScale;
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(NOTE_GAIN * p.gain, t0 + ATTACK_S);
      env.gain.exponentialRampToValueAtTime(SILENCE, t0 + ATTACK_S + decay);
      osc.connect(env).connect(out);
      osc.start(t0);
      osc.stop(t0 + ATTACK_S + decay + 0.05);
    }
  }
}

export class ChimePlayer {
  #ctx = null;

  async play(kind) {
    this.#ctx ??= new AudioContext();
    await this.#ctx.resume();
    scheduleChime(this.#ctx, this.#ctx.destination, kind);
  }
}
