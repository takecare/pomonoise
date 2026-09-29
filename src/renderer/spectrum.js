// Turning a raw FFT (AnalyserNode output) into something readable on a
// log-frequency chart. Pure functions, unit-tested in Node.

const FLOOR_DB = -200;
const finite = (db) => (Number.isFinite(db) ? Math.max(db, FLOOR_DB) : FLOOR_DB);

// Resample FFT bins (dB) onto log-spaced `freqs`, averaging power over a window
// of `octaves` width around each. Raw noise spectra jitter wildly; this is what
// makes the average shape visible.
export function smoothSpectrum(dbBins, binHz, freqs, octaves = 1 / 3) {
  const last = dbBins.length - 1;
  return freqs.map((f) => {
    let i0 = Math.floor((f * 2 ** (-octaves / 2)) / binHz);
    let i1 = Math.ceil((f * 2 ** (octaves / 2)) / binHz);
    if (i1 <= i0) i0 = i1 = Math.round(f / binHz);
    i0 = Math.min(last, Math.max(1, i0)); // skip the DC bin
    i1 = Math.min(last, Math.max(i0, i1));
    let power = 0;
    for (let i = i0; i <= i1; i++) power += 10 ** (finite(dbBins[i]) / 10);
    return 10 * Math.log10(power / (i1 - i0 + 1));
  });
}

// Shift `measured` vertically so its average matches `reference`. Absolute FFT
// levels depend on window and scaling constants, so we compare shape, not level.
export function alignDb(measured, reference) {
  let sum = 0;
  for (let i = 0; i < measured.length; i++) sum += reference[i] - measured[i];
  const shift = sum / measured.length;
  return measured.map((v) => v + shift);
}
