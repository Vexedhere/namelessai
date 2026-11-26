// Alarm sound via WebAudio (no audio files to ship). Browsers only allow audio after a user
// gesture, so we "unlock" the context on the first click/tap/keypress anywhere on the page.

let ctx: AudioContext | null = null;
let unlockBound = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function bindAudioUnlock() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') void c.resume();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
}

function beep(c: AudioContext, when: number, freq: number, dur = 0.16) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.35, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

/** Short rising two-note chime: "I heard you". Silent if the browser hasn't allowed audio yet. */
export function playChime(kind: 'wake' | 'sleep' = 'wake') {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.01;
  if (kind === 'wake') {
    beep(c, t, 660, 0.1);
    beep(c, t + 0.1, 990, 0.14);
  } else {
    beep(c, t, 990, 0.1);
    beep(c, t + 0.1, 520, 0.16);
  }
}

/** Starts a repeating "beep-beep-beep" until the returned function is called. */
export function startRinging(): () => void {
  const c = getCtx();
  if (!c) return () => {};
  if (c.state === 'suspended') void c.resume();
  const burst = () => {
    const t = c.currentTime + 0.02;
    beep(c, t, 880);
    beep(c, t + 0.24, 880);
    beep(c, t + 0.48, 1175);
  };
  burst();
  const id = setInterval(burst, 1200);
  return () => clearInterval(id);
}
