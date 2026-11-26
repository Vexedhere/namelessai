'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_COMPANION_URL, companionInfo, loadCompanion, safeCompanionUrl, saveCompanion, type CompanionInfo,
} from '@/lib/companion';
import { CloseIcon, LaptopIcon } from './Icons';

type Check = { state: 'idle' | 'checking' | 'ok' | 'error'; info?: CompanionInfo; message?: string };

const BROWSER_POWERS = [
  'Battery, network, screen and location',
  'Fullscreen · keep screen on · print · scroll',
  'Flashlight and vibration (Android Chrome)',
  'System notifications and spoken announcements',
  'Read your clipboard · save files to Downloads',
  'Open the dialer, SMS, WhatsApp, Maps, YouTube, Spotify',
];
const COMPANION_POWERS = [
  'System volume and mute',
  'Screen brightness',
  'Media keys: play, pause, next, previous',
  'Open any app or website on the computer',
  'Screenshots saved on the computer',
  'Lock, sleep, shut down, restart (opt-in, always asks)',
  'Type text and press keys (opt-in, always asks)',
];

export function DevicesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState(DEFAULT_COMPANION_URL);
  const [token, setToken] = useState('');
  const [paired, setPaired] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (!open) return;
    setOrigin(window.location.origin);
    const c = loadCompanion();
    setPaired(!!c);
    if (c) {
      setUrl(c.url);
      setToken(c.token);
      void test(c.url, c.token);
    } else setCheck({ state: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function test(u: string, t: string) {
    const safe = safeCompanionUrl(u);
    if (!safe) return setCheck({ state: 'error', message: 'The address must look like http://127.0.0.1:8765 (this computer only).' });
    if (!t.trim()) return setCheck({ state: 'error', message: 'Paste the pairing code the companion printed.' });
    setCheck({ state: 'checking' });
    try {
      const info = await companionInfo({ url: safe, token: t.trim() });
      setCheck({ state: 'ok', info });
    } catch (err) {
      setCheck({ state: 'error', message: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  function pair() {
    const safe = safeCompanionUrl(url);
    if (!safe || !token.trim()) return void test(url, token);
    saveCompanion({ url: safe, token: token.trim() });
    setPaired(true);
    void test(safe, token);
  }

  function unpair() {
    saveCompanion(null);
    setPaired(false);
    setToken('');
    setCheck({ state: 'idle' });
  }

  if (!open) return null;
  const input = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/50';
  const cmd = `python3 nameless_agent.py --origin ${origin || 'https://your-site'}`;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="dev-title" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-pop scroll-thin relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-canvas p-6 shadow-2xl shadow-black/70 sm:p-7">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white">
          <CloseIcon width={16} height={16} />
        </button>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-accent text-black">
          <LaptopIcon />
        </span>
        <h2 id="dev-title" className="mt-4 text-2xl font-semibold tracking-tight text-white">Devices</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Out of the box the AI can use everything a web page is allowed to. To let it control your <b className="text-zinc-200">computer itself</b> (volume, apps, lock screen…) you run a small companion
          program on that computer. A web page can’t do that on its own, by design.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/90">Works now · no install</p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-zinc-300">
              {BROWSER_POWERS.map((t) => <li key={t}>• {t}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">With the companion</p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-zinc-300">
              {COMPANION_POWERS.map((t) => <li key={t}>• {t}</li>)}
            </ul>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-semibold text-white">Set up the computer companion</h3>
        <ol className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
          <li>
            <b className="text-zinc-100">1.</b> Download{' '}
            <a href="/nameless_agent.py" download className="text-cyan-300 underline-offset-2 hover:underline">nameless_agent.py</a>{' '}
            (plain Python 3, no installs; read it first, it’s one file).
          </li>
          <li>
            <b className="text-zinc-100">2.</b> Run it in a terminal:
            <code className="mt-1.5 block select-all overflow-x-auto whitespace-pre rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-cyan-100">{cmd}</code>
            <span className="mt-1 block text-xs text-zinc-500">
              Add <code>--allow-power</code> for lock/sleep/shutdown and <code>--allow-input</code> for typing and key presses. They’re off unless you add them.
            </span>
          </li>
          <li><b className="text-zinc-100">3.</b> Paste the pairing code it prints below.</li>
        </ol>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className={input} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pairing code" aria-label="Pairing code" autoComplete="off" spellCheck={false} />
          <input className={`${input} sm:w-56`} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Companion address" spellCheck={false} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={pair} className="rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
            {paired ? 'Save & test' : 'Pair this computer'}
          </button>
          <button onClick={() => void test(url, token)} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm text-zinc-200 transition hover:bg-white/10">Test</button>
          {paired && <button onClick={unpair} className="rounded-xl px-3.5 py-2 text-sm text-red-300 transition hover:bg-red-500/10">Forget</button>}
          <span className="ml-auto text-xs">
            {check.state === 'checking' && <span className="text-zinc-400">Checking…</span>}
            {check.state === 'ok' && <span className="text-emerald-300">● Connected</span>}
            {check.state === 'error' && <span className="text-red-300">● Not connected</span>}
          </span>
        </div>

        {check.state === 'ok' && check.info && (
          <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs leading-relaxed text-emerald-100">
            {check.info.os} · {check.info.host} · v{check.info.version}. Power actions {check.info.allowPower ? 'on' : 'off'} · typing {check.info.allowInput ? 'on' : 'off'}.
            Try: “turn the volume to 30”, “open Spotify”, “take a screenshot”.
          </p>
        )}
        {check.state === 'error' && check.message && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-200">{check.message}</p>}

        <p className="mt-5 flex gap-2 text-xs leading-relaxed text-zinc-500">
          <span className="mt-0.5 shrink-0 text-zinc-400"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3z" /></svg></span>
          <span>
            The companion only listens on 127.0.0.1, accepts only this site’s address plus your secret code, runs a fixed list of actions (no free-form commands), and
            logs everything it does. Shutdown, restart, sleep, typing and key presses also ask for your approval here every time. The pairing code stays in this browser and is never uploaded.
          </span>
        </p>
      </div>
    </div>
  );
}
