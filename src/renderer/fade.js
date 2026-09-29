// Fade-out curve. Pure, so it can be unit-tested in Node.

// Multiplier (0..1) for the volume slider when `remainingMs` are left and the
// fade lasts `fadeMs`. It is applied to the slider *value*, and the slider maps
// to gain squared, so the fade falls steadily in perceived loudness instead of
// seeming to hang and then drop away at the end.
export function fadeFactor(remainingMs, fadeMs) {
  if (!(fadeMs > 0)) return 1;
  return Math.min(1, Math.max(0, remainingMs / fadeMs));
}
