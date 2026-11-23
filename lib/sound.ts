'use client';

let audioContext: AudioContext | null = null;
let unlockBound = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

/** Unlock browser audio after the first user interaction. */
export function bindAudioUnlock() {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Start a repeating alarm tone. Returns a cleanup function. */
export function startRinging() {
  const ctx = getAudioContext();
  if (!ctx) return () => {};
  if (ctx.state === 'suspended') void ctx.resume();

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const beep = () => {
    if (stopped || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.36);
  };

  beep();
  timer = setInterval(beep, 700);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
