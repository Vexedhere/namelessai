'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ListenMode, VoiceState } from '@/lib/useVoiceMode';
import { VOICE_LANGS, type SpeechQueue } from '@/lib/voice';
import { APP_CODENAME, APP_VERSION_LABEL } from '@/lib/version';
import { cleanAiName } from '@/lib/account';
import { CloseIcon } from './Icons';

/* ── geometry helpers (SVG viewBox is 600×600, centre 300,300) ───────────────── */
const C = 300;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;
const arc = (r: number, a0: number, a1: number) => {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

const BARS = 96;
const BAR_R = 138;

/* ── HUD colour presets ───────────────────────────────────────────────────────── */
const PRESETS = [
  { id: 'arc', label: 'Arc blue', main: '56 189 248', second: '250 204 21' },
  { id: 'ember', label: 'Ember', main: '251 146 60', second: '253 224 71' },
  { id: 'emerald', label: 'Emerald', main: '52 211 153', second: '190 242 100' },
  { id: 'crimson', label: 'Crimson', main: '248 113 113', second: '253 186 116' },
  { id: 'violet', label: 'Violet', main: '167 139 250', second: '244 114 182' },
  { id: 'theme', label: 'Match theme', main: 'var(--brand-400)', second: 'var(--accent)' },
] as const;

const STATE_LABEL: Record<VoiceState, string> = {
  off: 'Offline',
  standby: 'Standing by',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const NAME_IDEAS = ['Nova', 'Jarvis', 'Friday', 'Echo', 'Atlas', 'Luna', 'Orion'];

const QUICK = ['What can you do?', 'Set a 5 minute timer', 'What time is it in Tokyo?', 'Tell me a quick joke', 'Which version are you?'];

const tidy = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const tail = (s: string, n = 240) => (s.length > n ? `…${s.slice(-n).replace(/^\S*\s/, '')}` : s);
const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  open: boolean;
  state: VoiceState;
  mode: ListenMode;
  interim: string;
  aiName: string | null;
  userName?: string;
  lang: string;
  modelName: string;
  actionsOn: boolean;
  loading: boolean;
  userText: string;
  replyText: string;
  turns: number;
  hint?: string;
  canSpeak: boolean;
  onSaveName: (name: string) => void;
  onMode: (m: ListenMode) => void;
  onLang: (l: string) => void;
  onStop: () => void;
  onInterrupt: () => void;
  onSend: (text: string) => void;
  getSpeaker: () => SpeechQueue;
};

export function VoiceHUD(props: Props) {
  const { open } = props;
  if (!open) return null;
  return <HUDInner {...props} />;
}

function HUDInner({
  state,
  mode,
  interim,
  aiName,
  userName,
  lang,
  modelName,
  actionsOn,
  loading,
  userText,
  replyText,
  turns,
  hint,
  canSpeak,
  onSaveName,
  onMode,
  onLang,
  onStop,
  onInterrupt,
  onSend,
  getSpeaker,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const typeInputRef = useRef<HTMLInputElement>(null);
  const barRefs = useRef<(SVGLineElement | null)[]>([]);
  const stateRef = useRef<VoiceState>(state);
  stateRef.current = state;
  const activity = useRef(0);

  const [presetId, setPresetId] = useState<(typeof PRESETS)[number]['id']>('arc');
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const [booting, setBooting] = useState(true);
  const [settings, setSettings] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1.05);
  const [volume, setVolume] = useState(1);
  const [voiceURI, setVoiceURI] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [fs, setFs] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [startedAt] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);

  const needsName = !aiName;

  /* ---- boot sequence ------------------------------------------------------- */
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1500);
    return () => clearTimeout(t);
  }, []);

  /* ---- clock, network, battery -------------------------------------------- */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    type Bat = { level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
    let bat: Bat | null = null;
    let dead = false;
    const read = () => bat && !dead && setBattery({ level: Math.round(bat.level * 100), charging: bat.charging });
    (navigator as unknown as { getBattery?: () => Promise<Bat> }).getBattery?.()
      .then((b) => {
        bat = b;
        read();
        b.addEventListener('levelchange', read);
        b.addEventListener('chargingchange', read);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      bat?.removeEventListener('levelchange', read);
      bat?.removeEventListener('chargingchange', read);
    };
  }, []);

  /* ---- speaker settings ---------------------------------------------------- */
  useEffect(() => {
    if (!canSpeak) return;
    const q = getSpeaker();
    setRate(q.rate);
    setVolume(q.volume || 1);
    setVoiceURI(q.voiceURI);
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, [canSpeak, getSpeaker]);

  const applyRate = (v: number) => {
    setRate(v);
    getSpeaker().rate = v;
  };
  const applyVolume = (v: number) => {
    setVolume(v);
    if (!muted) getSpeaker().volume = v;
  };
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      getSpeaker().volume = next ? 0 : volume;
      if (next) getSpeaker().cancel();
      return next;
    });
  }, [getSpeaker, volume]);
  const applyVoice = (uri: string) => {
    setVoiceURI(uri);
    getSpeaker().voiceURI = uri;
  };
  // unmute again if the HUD closes (the speaker outlives it)
  useEffect(
    () => () => {
      try {
        const q = getSpeaker();
        if (q.volume === 0) q.volume = 1;
      } catch {
        /* ignore */
      }
    },
    [getSpeaker],
  );

  const langVoices = useMemo(() => {
    const base = lang.split('-')[0].toLowerCase();
    return voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  }, [voices, lang]);

  /* ---- fullscreen ---------------------------------------------------------- */
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
    },
    [],
  );

  /* ---- focus + keyboard ---------------------------------------------------- */
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) setTimeout(() => (needsName ? nameInputRef.current : null)?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (stateRef.current === 'speaking' || stateRef.current === 'standby') onInterrupt();
      } else if (k === 'm') toggleMute();
      else if (k === 'f') toggleFullscreen();
      else if (k === 's') setSettings((s) => !s);
      else if (k === 't') setTyping((s) => !s);
      else if (k === '1') onMode('push');
      else if (k === '2') onMode('wake');
      else if (k === '3') onMode('open');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onInterrupt, onMode, toggleMute, toggleFullscreen]);

  useEffect(() => {
    if (typing) setTimeout(() => typeInputRef.current?.focus(), 30);
  }, [typing]);

  /* ---- audio-style visualiser (procedural: no second microphone stream) ---- */
  useEffect(() => {
    if (interim) activity.current = 1;
  }, [interim]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let t = 0;
    const paint = () => {
      t += 0.016;
      activity.current *= 0.94;
      const st = stateRef.current;
      for (let i = 0; i < BARS; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        let a: number;
        if (st === 'speaking') a = 0.3 + 0.7 * Math.abs(Math.sin(t * 5.1 + i * 0.7) * Math.sin(t * 2.3 + i * 0.31));
        else if (st === 'listening') a = 0.08 + (0.15 + 0.65 * activity.current) * Math.abs(Math.sin(t * 6 + i * 0.9));
        else if (st === 'thinking') {
          const ph = (((i / BARS - t * 0.7) % 1) + 1) % 1;
          a = 0.06 + 0.85 * Math.max(0, 1 - ph * 5);
        } else a = 0.07 + 0.05 * Math.sin(t * 1.5 + i * 0.4);
        el.setAttribute('y2', String(C - BAR_R - (3 + a * 30)));
      }
      if (!reduce) raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- static ring geometry ------------------------------------------------ */
  const ticks = useMemo(() => {
    let d = '';
    for (let i = 0; i < 120; i++) {
      const a = i * 3;
      const [x0, y0] = pt(262, a);
      const [x1, y1] = pt(i % 5 === 0 ? 279 : 270, a);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, []);
  const bandSegments = useMemo(() => {
    const out: { d: string; o: number }[] = [];
    const start = 160;
    const count = 38;
    for (let i = 0; i < count; i++) {
      const a0 = start + i * 4.6;
      out.push({ d: arc(228, a0, a0 + 3.8), o: 0.14 + 0.5 * (i / count) });
    }
    return out;
  }, []);
  const innerDots = useMemo(() => [0, 1, 2, 3, 4].map((i) => pt(246, 292 + i * 7)), []);

  /* ---- name rendering ------------------------------------------------------ */
  const name = aiName ?? '';
  const dotted = !!name && !/\s/.test(name) && [...name].length <= 12;
  const nameText = dotted ? `${[...name.toUpperCase()].join('.')}.` : name.toUpperCase();
  const longest = Math.max(1, ...name.split(/\s+/).map((w) => [...w].length), Math.ceil([...name].length / 2));
  const k = Math.min(0.07, 0.4 / (longest * (dotted ? 1.3 : 1.05)));
  const wakeLabel = (name || 'Nameless').split(' ')[0];

  const submitName = (raw: string) => {
    const n = cleanAiName(raw);
    if (n) {
      onSaveName(n);
      setNameDraft('');
    }
  };

  const mmss = (() => {
    const s = Math.floor((now.getTime() - startedAt) / 1000);
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  })();

  const reply = tail(tidy(replyText));
  const caption =
    interim ||
    (state === 'thinking' || state === 'speaking' ? reply : '') ||
    hint ||
    (needsName
      ? 'Type a name below, or just say it out loud.'
      : state === 'standby'
        ? `Say “Hey ${wakeLabel}” and then what you need.`
        : state === 'listening'
          ? 'Go ahead, I’m listening.'
          : '');
  const captionWho = interim ? (userName ? userName.split(' ')[0] : 'You') : state === 'thinking' || state === 'speaking' ? wakeLabel : '';

  const rootStyle = {
    '--hud': preset.main,
    '--hud-2': preset.second,
    '--s': 'max(230px, min(92vw, calc(100dvh - 360px), 680px))',
  } as CSSProperties;

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    onSend(v);
  };

  const mainAction = state === 'speaking' ? 'Skip' : state === 'standby' ? 'Wake' : null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${name || 'AI'} voice mode`}
      data-state={state}
      style={rootStyle}
      className="hud-root fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#02060d] text-white"
    >
      {/* blueprint backdrop */}
      <div aria-hidden className="hud-backdrop pointer-events-none absolute inset-0" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none">
        <g className="hud-s" strokeWidth="1">
          <rect x="40" y="60" width="210" height="130" />
          <rect x="60" y="80" width="80" height="40" />
          <path d="M40 220h260M120 220v90h140" />
          <circle cx="880" cy="140" r="70" />
          <circle cx="880" cy="140" r="42" />
          <path d="M810 140h140M880 70v140" />
          <rect x="720" y="470" width="250" height="150" />
          <path d="M720 520h250M800 470v150M880 470v150" />
          <path d="M60 520h200l40 60h140" />
          <circle cx="110" cy="610" r="26" />
          <path d="M470 40h140l30 30h120" />
        </g>
        <text x="46" y="52" fontSize="11" className="hud-f" fillOpacity="0.9" letterSpacing="2">
          MYTHICAL STUDIOS · CLEARANCE LEVEL 5
        </text>
      </svg>
      <div aria-hidden className="hud-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="hud-vignette pointer-events-none absolute inset-0" />

      {/* top bar */}
      <header className="relative z-10 flex items-center gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="hidden font-hud text-[11px] leading-tight text-[rgb(var(--hud))] sm:block">
          <div className="text-base tabular-nums text-white">
            {pad(now.getHours())}:{pad(now.getMinutes())}
            <span className="text-[rgb(var(--hud)/0.6)]">:{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-0.5 opacity-70">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        </div>
        <div className="mx-auto flex items-center gap-2 font-hud text-[11px] text-[rgb(var(--hud))] sm:mx-0 sm:ml-auto">
          <span className={`h-1.5 w-1.5 rounded-full ${state === 'off' ? 'bg-zinc-500' : 'animate-pulse bg-[rgb(var(--hud))]'}`} />
          <span>{STATE_LABEL[state]}</span>
          <span className="rounded-md border border-[rgb(var(--hud)/0.45)] bg-[rgb(var(--hud)/0.1)] px-2 py-0.5 text-white">
            {APP_VERSION_LABEL} {APP_CODENAME}
          </span>
        </div>
        <button
          onClick={onStop}
          aria-label="Close voice mode"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[rgb(var(--hud)/0.4)] bg-black/40 text-zinc-200 transition hover:bg-[rgb(var(--hud)/0.18)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--hud))]"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      {/* stage */}
      <main className="relative z-10 grid min-h-0 flex-1 place-items-center px-3">
        {/* side telemetry (desktop) */}
        <aside aria-label="Telemetry" className="absolute left-6 top-1/2 hidden -translate-y-1/2 font-hud text-[11px] leading-6 text-[rgb(var(--hud))] lg:block">
          <Stat label="Link" value={online ? 'Online' : 'Offline'} bad={!online} />
          <Stat label="Power" value={battery ? `${battery.level}%${battery.charging ? ' ⚡' : ''}` : 'Mains'} bad={!!battery && battery.level <= 15 && !battery.charging} />
          <Stat label="Session" value={mmss} />
          <Stat label="Turns" value={String(turns)} />
        </aside>
        <aside aria-label="System" className="absolute right-6 top-1/2 hidden max-w-[11rem] -translate-y-1/2 text-right font-hud text-[11px] leading-6 text-[rgb(var(--hud))] lg:block">
          <Stat label="Core" value={modelName} right />
          <Stat label="Actions" value={actionsOn ? 'Armed' : 'Off'} right />
          <Stat label="Mic" value={mode === 'push' ? 'Tap' : mode === 'wake' ? 'Wake word' : 'Open'} right />
          <Stat label="Voice" value={!canSpeak ? 'No speaker' : muted ? 'Muted' : `${rate.toFixed(2)}×`} right />
        </aside>

        <div className="relative aspect-square" style={{ width: 'var(--s)' }}>
          <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <radialGradient id="hud-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgb(var(--hud))" stopOpacity="0.16" />
                <stop offset="70%" stopColor="rgb(var(--hud))" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#02060d" stopOpacity="0.85" />
              </radialGradient>
              <filter id="hud-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g className={booting ? 'hud-boot' : ''}>
              {/* outer broken ring */}
              <g className="hud-spin hud-spin-slow">
                <circle cx={C} cy={C} r="290" fill="none" className="hud-s" strokeWidth="3" strokeDasharray="420 70 160 70 300 70" strokeLinecap="round" filter="url(#hud-glow)" />
              </g>
              {/* tick ring */}
              <g className="hud-spin hud-spin-rev">
                <path d={ticks} className="hud-s" strokeWidth="1.4" opacity="0.75" fill="none" />
              </g>
              {/* segmented band */}
              <g className="hud-spin hud-spin-band">
                {bandSegments.map((s, i) => (
                  <path key={i} d={s.d} fill="none" className="hud-s" strokeWidth="26" opacity={s.o} />
                ))}
                <path d={arc(243, 160, 335)} fill="none" className="hud-s" strokeWidth="1.5" opacity="0.8" />
                <path d={arc(213, 160, 335)} fill="none" className="hud-s" strokeWidth="1.5" opacity="0.8" />
              </g>
              {/* amber arc + dots */}
              <g className="hud-spin hud-spin-mid">
                <path d={arc(201, 205, 268)} fill="none" className="hud-s2" strokeWidth="3.5" strokeLinecap="round" />
                {innerDots.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="2.6" className="hud-f2" />
                ))}
              </g>
              {/* inner broken ring */}
              <g className="hud-spin hud-spin-fast">
                <circle cx={C} cy={C} r="188" fill="none" className="hud-s" strokeWidth="2" strokeDasharray="90 14 40 14 140 14" opacity="0.85" />
              </g>
              {/* core */}
              <circle cx={C} cy={C} r="172" fill="url(#hud-core)" className="hud-s" strokeWidth="1.5" opacity="0.95" />
              <circle cx={C} cy={C} r="162" fill="none" className="hud-s" strokeWidth="1" strokeDasharray="1.5 7" opacity="0.7" />
              <circle cx={C} cy={C} r="62" fill="none" className="hud-s" strokeWidth="1" strokeDasharray="1.5 6" opacity="0.28" />

              {/* state effects */}
              {state === 'listening' && <circle cx={C} cy={C} r="172" fill="none" className="hud-s hud-ping" strokeWidth="2" />}
              {state === 'thinking' && (
                <g className="hud-spin hud-spin-think">
                  <path d={arc(176, 0, 70)} fill="none" className="hud-s" strokeWidth="5" strokeLinecap="round" opacity="0.95" filter="url(#hud-glow)" />
                </g>
              )}

              {/* waveform bars */}
              <g>
                {Array.from({ length: BARS }, (_, i) => (
                  <line
                    key={i}
                    ref={(el) => {
                      barRefs.current[i] = el;
                    }}
                    x1={C}
                    x2={C}
                    y1={C - BAR_R}
                    y2={C - BAR_R - 4}
                    transform={`rotate(${(i * 360) / BARS} ${C} ${C})`}
                    className="hud-s"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                ))}
              </g>
            </g>
          </svg>

          {/* centre text */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex w-[40%] flex-col items-center text-center">
              {needsName ? (
                <div className="hud-name-in" key="needs-name">
                  <p className="font-hud leading-tight text-white" style={{ fontSize: 'calc(var(--s) * 0.052)', textShadow: '0 0 14px rgb(var(--hud) / 0.8)' }}>
                    NAME
                    <br />
                    YOUR AI
                  </p>
                  <span className="hud-caret mt-2 inline-block h-[0.9em] w-[2px] bg-[rgb(var(--hud))]" style={{ fontSize: 'calc(var(--s) * 0.04)' }} />
                </div>
              ) : (
                <div className="hud-name-in" key={name}>
                  <p
                    className={`font-hud leading-tight text-white ${state === 'speaking' ? 'hud-breathe' : ''}`}
                    style={{ fontSize: `calc(var(--s) * ${k})`, letterSpacing: '0.04em', textShadow: '0 0 16px rgb(var(--hud) / 0.85), 0 0 2px rgb(255 255 255 / 0.6)', textWrap: 'balance' } as CSSProperties}
                  >
                    {nameText}
                  </p>
                  <p className="mt-[0.9em] font-hud text-[rgb(var(--hud))]" style={{ fontSize: 'calc(var(--s) * 0.019)', letterSpacing: '0.18em' }}>
                    {APP_VERSION_LABEL}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* boot lines */}
          {booting && (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="space-y-1 text-center font-hud text-[10px] text-[rgb(var(--hud))]">
                <p className="hud-boot-line" style={{ animationDelay: '0ms' }}>INITIALISING CORE</p>
                <p className="hud-boot-line" style={{ animationDelay: '350ms' }}>VOICE LINK ESTABLISHED</p>
                <p className="hud-boot-line" style={{ animationDelay: '700ms' }}>
                  {APP_VERSION_LABEL} {APP_CODENAME.toUpperCase()} ONLINE
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* dock */}
      <footer className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-4 sm:pb-6">
        {/* captions */}
        <div aria-live="polite" className="min-h-[3.25rem] text-center">
          {caption && (
            <p className="line-clamp-3 text-[15px] leading-snug text-zinc-200">
              {captionWho && <span className="mr-2 font-hud text-[10px] text-[rgb(var(--hud))]">{captionWho}</span>}
              {caption}
            </p>
          )}
          {!caption && userText && state === 'listening' && <p className="line-clamp-1 text-xs text-zinc-500">Last: {userText}</p>}
        </div>

        {/* name your AI */}
        {needsName ? (
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitName(nameDraft)}
                maxLength={30}
                placeholder="Type a name, e.g. Nova"
                aria-label="Name your AI"
                className="min-w-0 flex-1 rounded-2xl border border-[rgb(var(--hud)/0.4)] bg-black/50 px-4 py-3 text-base text-white placeholder-zinc-500 outline-none transition focus:border-[rgb(var(--hud))] focus:shadow-[0_0_24px_-6px_rgb(var(--hud)/0.7)]"
              />
              <button
                onClick={() => submitName(nameDraft)}
                disabled={!cleanAiName(nameDraft)}
                className="rounded-2xl bg-[rgb(var(--hud))] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Save name
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {NAME_IDEAS.map((n) => (
                <button key={n} onClick={() => submitName(n)} className="rounded-full border border-[rgb(var(--hud)/0.3)] bg-black/30 px-3 py-1 text-xs text-zinc-300 transition hover:bg-[rgb(var(--hud)/0.15)] hover:text-white">
                  {n}
                </button>
              ))}
              <button onClick={() => submitName('NamelessAI')} className="rounded-full px-3 py-1 text-xs text-zinc-500 transition hover:text-zinc-300">
                Use default
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* quick commands */}
            {(state === 'listening' || state === 'standby') && !typing && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK.map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-full border border-[rgb(var(--hud)/0.3)] bg-black/30 px-3 py-1 text-xs text-zinc-300 transition hover:bg-[rgb(var(--hud)/0.15)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--hud))]">
                    {q}
                  </button>
                ))}
              </div>
            )}
            {typing && (
              <div className="flex gap-2">
                <input
                  ref={typeInputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      send(typed);
                      setTyped('');
                    }
                  }}
                  placeholder={`Type to ${name}…`}
                  aria-label="Type a message"
                  className="min-w-0 flex-1 rounded-2xl border border-[rgb(var(--hud)/0.4)] bg-black/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[rgb(var(--hud))]"
                />
                <button
                  onClick={() => {
                    send(typed);
                    setTyped('');
                  }}
                  disabled={!typed.trim() || loading}
                  className="rounded-2xl bg-[rgb(var(--hud))] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            )}
          </>
        )}

        {/* controls */}
        <div className="flex items-center justify-center gap-2">
          <div role="group" aria-label="Listening mode" className="flex overflow-hidden rounded-full border border-[rgb(var(--hud)/0.35)] bg-black/40 text-xs">
            {(
              [
                ['push', 'Tap', 'Tap to talk. It listens once after each reply (key 1)'],
                ['wake', 'Wake', `Always listening, reacts to “Hey ${wakeLabel}” (key 2)`],
                ['open', 'Open', 'Always listening, answers everything it hears (key 3)'],
              ] as const
            ).map(([m, label, title]) => (
              <button
                key={m}
                onClick={() => onMode(m)}
                aria-pressed={mode === m}
                title={title}
                className={`px-3.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--hud))] ${mode === m ? 'bg-[rgb(var(--hud)/0.25)] text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mainAction && (
            <button onClick={onInterrupt} className="rounded-full bg-[rgb(var(--hud))] px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {mainAction}
            </button>
          )}

          <IconBtn label={typing ? 'Hide keyboard (T)' : 'Type instead (T)'} active={typing} onClick={() => setTyping((v) => !v)}>
            <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10" />
          </IconBtn>
          {canSpeak && (
            <IconBtn label={muted ? 'Unmute voice (M)' : 'Mute voice, captions only (M)'} active={muted} onClick={toggleMute}>
              {muted ? <path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /> : <path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
            </IconBtn>
          )}
          <IconBtn label="Voice settings (S)" active={settings} onClick={() => setSettings((v) => !v)}>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </IconBtn>
          <IconBtn label={fs ? 'Exit full screen (F)' : 'Full screen (F)'} active={fs} onClick={toggleFullscreen}>
            {fs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </IconBtn>
        </div>

        {/* settings drawer */}
        {settings && (
          <div className="hud-pop grid gap-3 rounded-2xl border border-[rgb(var(--hud)/0.35)] bg-black/70 p-4 text-sm backdrop-blur-md sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-400">
              Language
              <select value={lang} onChange={(e) => onLang(e.target.value)} className="rounded-xl border border-white/10 bg-black/60 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-[rgb(var(--hud))]">
                {VOICE_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {canSpeak && (
              <label className="grid gap-1 text-xs text-zinc-400">
                Voice
                <select value={voiceURI} onChange={(e) => applyVoice(e.target.value)} className="rounded-xl border border-white/10 bg-black/60 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-[rgb(var(--hud))]">
                  <option value="">Automatic (best match)</option>
                  {langVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canSpeak && (
              <label className="grid gap-1 text-xs text-zinc-400">
                Speaking speed · {rate.toFixed(2)}×
                <input type="range" min={0.7} max={1.5} step={0.05} value={rate} onChange={(e) => applyRate(Number(e.target.value))} className="accent-[rgb(var(--hud))]" />
              </label>
            )}
            {canSpeak && (
              <label className="grid gap-1 text-xs text-zinc-400">
                Volume · {Math.round(volume * 100)}%
                <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={(e) => applyVolume(Number(e.target.value))} className="accent-[rgb(var(--hud))]" />
              </label>
            )}
            <div className="grid gap-1.5 text-xs text-zinc-400 sm:col-span-2">
              HUD colour
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPresetId(p.id)}
                    aria-pressed={presetId === p.id}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${presetId === p.id ? 'border-white/70 text-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: `rgb(${p.main})` }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500 sm:col-span-2">
              Keys: <b className="text-zinc-300">Space</b> skip / wake · <b className="text-zinc-300">1 2 3</b> tap / wake / open · <b className="text-zinc-300">M</b> mute · <b className="text-zinc-300">T</b> type · <b className="text-zinc-300">F</b> full screen · <b className="text-zinc-300">Esc</b> close
            </p>
          </div>
        )}
      </footer>
    </div>
  );
}

function Stat({ label, value, bad, right }: { label: string; value: string; bad?: boolean; right?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 ${right ? 'justify-end' : ''}`}>
      <span className="opacity-60">{label}</span>
      <span className={`tabular-nums ${bad ? 'text-red-300' : 'text-white'}`}>{value}</span>
    </div>
  );
}

function IconBtn({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid h-9 w-9 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--hud))] ${
        active ? 'border-[rgb(var(--hud))] bg-[rgb(var(--hud)/0.22)] text-white' : 'border-[rgb(var(--hud)/0.3)] bg-black/40 text-zinc-300 hover:text-white'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
