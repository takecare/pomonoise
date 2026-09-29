// Noise generation. generateNoise() is pure (testable in Node); NoisePlayer
// wraps it in Web Audio for playback.

export const NOISE_TYPES = ['white', 'pink', 'brown', 'blue', 'violet'];

const TARGET_RMS = 0.2;
const LOOP_SECONDS = 12;
const FADE_SECONDS = 1;

function rawSamples(type, length, random) {
  const out = new Float32Array(length);
  const white = () => random() * 2 - 1;
  switch (type) {
    case 'white':
      for (let i = 0; i < length; i++) out[i] = white();
      break;
    case 'pink': {
      // Paul Kellet's economy filter.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = white();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
      break;
    }
    case 'brown': {
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * white()) / 1.02;
        out[i] = last;
      }
      break;
    }
    case 'blue': {
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const w = white();
        out[i] = w - prev;
        prev = w;
      }
      break;
    }
    case 'violet': {
      let p1 = 0, p2 = 0;
      for (let i = 0; i < length; i++) {
        const w = white();
        out[i] = w - 2 * p1 + p2;
        p2 = p1;
        p1 = w;
      }
      break;
    }
    default:
      throw new Error(`Unknown noise type: ${type}`);
  }
  return out;
}

// Returns `length` samples that loop seamlessly, normalised to a common loudness.
export function generateNoise(type, length, { random = Math.random, fade = Math.floor(length / 10) } = {}) {
  const raw = rawSamples(type, length + fade, random);
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
  #master = null;
  #source = null;
  #buffers = new Map();
  #type = 'brown';
  #volume = 0.5;
  #playing = false;

  get playing() { return this.#playing; }
  get type() { return this.#type; }

  setVolume(v) {
    this.#volume = Math.min(1, Math.max(0, v));
    if (this.#master) this.#ramp(this.#master.gain, this.#volume ** 2, 0.05);
  }

  setType(type) {
    if (type === this.#type) return;
    this.#type = type;
    if (this.#playing) this.#swapSource();
  }

  async play() {
    if (this.#playing) return;
    this.#playing = true;
    this.#ensureContext();
    await this.#ctx.resume();
    this.#master.gain.value = 0;
    this.#swapSource();
    this.#ramp(this.#master.gain, this.#volume ** 2, 0.3);
  }

  stop() {
    if (!this.#playing) return;
    this.#playing = false;
    this.#ramp(this.#master.gain, 0, 0.15);
    const old = this.#source;
    this.#source = null;
    setTimeout(() => old?.stop(), 800);
  }

  #ensureContext() {
    if (this.#ctx) return;
    this.#ctx = new AudioContext();
    this.#master = this.#ctx.createGain();
    this.#master.connect(this.#ctx.destination);
  }

  #buffer(type) {
    if (!this.#buffers.has(type)) {
      const rate = this.#ctx.sampleRate;
      const length = LOOP_SECONDS * rate;
      const buf = this.#ctx.createBuffer(2, length, rate);
      const fade = FADE_SECONDS * rate;
      for (let ch = 0; ch < 2; ch++) buf.copyToChannel(generateNoise(type, length, { fade }), ch);
      this.#buffers.set(type, buf);
    }
    return this.#buffers.get(type);
  }

  // Start a source for the current type, fading it in; the previous one is cut.
  #swapSource() {
    const ctx = this.#ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#buffer(this.#type);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(this.#master);
    src.start();
    this.#ramp(g.gain, 1, 0.2);
    const old = this.#source;
    this.#source = src;
    if (old) {
      old.disconnect();
      old.stop(ctx.currentTime + 0.05);
    }
  }

  #ramp(param, value, timeConstant) {
    param.setTargetAtTime(value, this.#ctx.currentTime, timeConstant);
  }
}
