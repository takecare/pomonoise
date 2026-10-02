// Noise playback. The source is always looped white noise; the "colour" comes
// from an EQ curve (see eq.js) applied by a chain of biquad filters.
//
//   white loop -> 10 peaking filters -> loudness compensation
//     -> analyser (for the visualiser) -> volume -> limiter -> speakers

import { BAND_FREQS, PEAK_Q, solveFilterGains, compensationDb } from './eq.js';

const TARGET_RMS = 0.2;
const LOOP_SECONDS = 12;
const FADE_SECONDS = 1;
const FFT_SIZE = 8192;
const SMOOTHING_S = 0.03; // time constant for parameter changes, avoids zipper noise
const FADE_SMOOTHING_S = 0.3; // slower, so fade steps and the jump back to full volume are gentle

// White noise that loops seamlessly, normalised to a fixed loudness. Pure, so
// it can be unit-tested in Node.
export function generateWhiteNoise(length, { random = Math.random, fade = Math.floor(length / 10) } = {}) {
  const raw = new Float32Array(length + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = random() * 2 - 1;
  const out = raw.slice(0, length);
  // Equal-power crossfade of the tail into the head hides the loop seam.
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * Math.sin((t * Math.PI) / 2) + raw[length + i] * Math.cos((t * Math.PI) / 2);
  }
  let sum = 0;
  for (let i = 0; i < length; i++) sum += out[i] * out[i];
  const gain = TARGET_RMS / Math.sqrt(sum / length || 1);
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * gain));
  return out;
}

export class NoisePlayer {
  #ctx = null;
  #filters = [];
  #comp = null;
  #analyser = null;
  #master = null;
  #source = null;
  #buffer = null;
  #spectrum = null;
  #target = null; // requested curve, dB per band
  #volume = 0.5;
  #fade = 1; // 0..1 multiplier on the volume slider, driven by the fade-out setting
  #playing = false;

  get playing() { return this.#playing; }
  get fade() { return this.#fade; }

  setVolume(v) {
    this.#volume = Math.min(1, Math.max(0, v));
    if (this.#master && this.#playing) this.#ramp(this.#master.gain, this.#gainTarget());
  }

  // Scale the volume for a fade-out (1 = full, 0 = silent).
  setFade(multiplier) {
    this.#fade = Math.min(1, Math.max(0, multiplier));
    if (this.#master && this.#playing) this.#ramp(this.#master.gain, this.#gainTarget(), FADE_SMOOTHING_S);
  }

  // The slider maps to gain squared, which tracks perceived loudness better than linear.
  #gainTarget() {
    return (this.#volume * this.#fade) ** 2;
  }

  // targetDb: desired level (dB relative to white noise) at each of BAND_FREQS.
  setCurve(targetDb) {
    this.#target = targetDb.slice();
    if (this.#ctx) this.#applyCurve();
  }

  async play() {
    if (this.#playing) return;
    this.#playing = true;
    this.#ensureContext();
    await this.#ctx.resume();
    if (!this.#playing) return; // stopped while resuming
    this.#master.gain.value = 0;
    this.#startSource();
    this.#ramp(this.#master.gain, this.#gainTarget(), 0.1);
  }

  stop() {
    if (!this.#playing) return;
    this.#playing = false;
    this.#ramp(this.#master.gain, 0, 0.05);
    const old = this.#source;
    this.#source = null;
    setTimeout(() => old?.stop(), 500);
  }

  // Current output spectrum in dB per FFT bin, or null before audio has started.
  readSpectrum() {
    if (!this.#analyser) return null;
    this.#analyser.getFloatFrequencyData(this.#spectrum);
    return { db: this.#spectrum, binHz: this.#ctx.sampleRate / FFT_SIZE };
  }

  #ensureContext() {
    if (this.#ctx) return;
    const ctx = (this.#ctx = new AudioContext());
    this.#filters = BAND_FREQS.map((f) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = f;
      filter.Q.value = PEAK_Q;
      return filter;
    });
    this.#comp = ctx.createGain();
    this.#analyser = ctx.createAnalyser();
    this.#analyser.fftSize = FFT_SIZE;
    this.#analyser.smoothingTimeConstant = 0.85;
    this.#spectrum = new Float32Array(this.#analyser.frequencyBinCount);
    this.#master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor(); // safety net against clipping
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;

    [...this.#filters, this.#comp, this.#analyser, this.#master, limiter, ctx.destination].reduce((a, b) => a.connect(b));
    this.#applyCurve(true);
  }

  #applyCurve(immediate = false) {
    if (!this.#target) return;
    const sr = this.#ctx.sampleRate;
    const gains = solveFilterGains(this.#target, sr);
    const comp = 10 ** (compensationDb(gains, sr) / 20);
    const set = (param, v) => (immediate ? (param.value = v) : this.#ramp(param, v));
    gains.forEach((g, i) => set(this.#filters[i].gain, g));
    set(this.#comp.gain, comp);
  }

  #getBuffer() {
    if (!this.#buffer) {
      const rate = this.#ctx.sampleRate;
      const length = LOOP_SECONDS * rate;
      this.#buffer = this.#ctx.createBuffer(2, length, rate);
      for (let ch = 0; ch < 2; ch++) {
        this.#buffer.copyToChannel(generateWhiteNoise(length, { fade: FADE_SECONDS * rate }), ch);
      }
    }
    return this.#buffer;
  }

  #startSource() {
    const node = this.#ctx.createBufferSource();
    node.buffer = this.#getBuffer();
    node.loop = true;
    node.connect(this.#filters[0]);
    node.start();
    this.#source = node;
  }

  #ramp(param, value, timeConstant = SMOOTHING_S) {
    param.setTargetAtTime(value, this.#ctx.currentTime, timeConstant);
  }
}
