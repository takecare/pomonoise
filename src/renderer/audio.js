// One shared AudioContext for the whole app, plus the workarounds iOS needs.
//
// iOS Safari is stricter than other browsers:
//  1. Audio can only start from a user gesture, and a context created or resumed
//     outside one stays silent. So there is a single context, created and resumed
//     on the first tap (unlockAudio), which later timer-driven sounds then reuse.
//  2. Web Audio is muted by the ring/silent switch unless the page's audio session
//     is "playback" (navigator.audioSession, iOS 16.4+). Older iOS only un-mutes
//     it while an <audio> element is playing, so there we loop a silent file.

let ctx = null;
let silent = null;

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

export function getAudioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
  }
  return ctx;
}

// Call from a user gesture. Safe to call repeatedly (it is, on every tap).
export function unlockAudio() {
  const c = getAudioContext();
  if (c.state !== 'running') c.resume().catch(() => {});
  if (isIOS() && !navigator.audioSession && !silent) {
    silent = new Audio('silence.wav');
    silent.loop = true;
    silent.play().catch(() => { silent = null; }); // try again on the next tap
  }
  return c;
}

// Unlock on the first tap or key press, and keep trying on later ones (iOS can
// suspend the context again, e.g. after a phone call).
export function unlockOnGesture(target = document) {
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
    target.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
}
