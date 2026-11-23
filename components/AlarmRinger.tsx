'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  EMPTY_ALARMS, addAlarm, clearAlarms, formatDuration, formatWhen, getAlarms, nextOccurrence, removeAlarm, replaceAlarm, subscribeAlarms, type Alarm,
} from '@/lib/alarms';
import { bindAudioUnlock, startRinging } from '@/lib/sound';
import { speakOnce } from '@/lib/voice';
import { BellIcon, CloseIcon } from './Icons';

const STALE_MS = 15 * 60_000; // an alarm missed by more than this (laptop slept) is dropped silently
const SNOOZE_MIN = 5;
const AUTO_STOP_MS = 2 * 60_000;

export function useAlarms() {
  return useSyncExternalStore(subscribeAlarms, getAlarms, () => EMPTY_ALARMS);
}

/** Watches the alarm store and rings when something is due. Mount once, at the page root. */
export function AlarmRinger() {
  const [ringing, setRinging] = useState<Alarm[]>([]);
  const stopSound = useRef<(() => void) | null>(null);
  const baseTitle = useRef('');

  useEffect(() => {
    bindAudioUnlock();
    baseTitle.current = document.title;
  }, []);

  // due-check: every second, and immediately when the tab becomes visible again
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = getAlarms().filter((a) => a.at <= now);
      if (!due.length) return;
      const fresh: Alarm[] = [];
      for (const a of due) {
        const next = nextOccurrence(a.at, a.repeat, now);
        if (next) replaceAlarm(a.id, { at: next });
        else removeAlarm(a.id);
        if (now - a.at <= STALE_MS) fresh.push(a);
      }
      if (!fresh.length) return;
      setRinging((cur) => [...cur, ...fresh]);
      for (const a of fresh) {
        const title = a.label || (a.kind === 'timer' ? 'Timer finished' : 'Alarm');
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(a.kind === 'timer' ? '⏲️ Timer' : '⏰ Alarm', { body: title, tag: a.id, requireInteraction: true });
          }
        } catch {
          /* some mobile browsers only allow service-worker notifications */
        }
        speakOnce(a.kind === 'timer' ? `Your timer is done. ${a.label}` : `Alarm. ${a.label}`);
      }
    };
    check();
    const id = setInterval(check, 1000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // sound + title flash while anything is ringing
  useEffect(() => {
    if (!ringing.length) return;
    stopSound.current = startRinging();
    const flash = setInterval(() => {
      document.title = document.title.startsWith('⏰') ? baseTitle.current : '⏰ Alarm!';
    }, 800);
    const auto = setTimeout(() => setRinging([]), AUTO_STOP_MS);
    return () => {
      stopSound.current?.();
      stopSound.current = null;
      clearInterval(flash);
      clearTimeout(auto);
      document.title = baseTitle.current;
    };
  }, [ringing.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (id: string) => setRinging((cur) => cur.filter((a) => a.id !== id));
  const snooze = (a: Alarm) => {
    addAlarm({ at: Date.now() + SNOOZE_MIN * 60_000, label: a.label, kind: a.kind, repeat: 'none' });
    dismiss(a.id);
  };

  if (!ringing.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-3 px-4" role="alertdialog" aria-live="assertive">
      {ringing.map((a) => (
        <div key={a.id + a.at} className="pointer-events-auto flex w-full max-w-md animate-pop items-center gap-4 rounded-3xl border border-amber-300/40 bg-[#14100a]/95 p-4 shadow-[0_0_60px_rgba(251,191,36,0.25)] backdrop-blur-xl">
          <div className="grid h-12 w-12 shrink-0 animate-pulse place-items-center rounded-2xl bg-amber-400/20 text-amber-300">
            <BellIcon width={24} height={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-300/80">{a.kind === 'timer' ? 'Timer done' : 'Alarm'}</p>
            <p className="truncate text-base font-semibold text-white">{a.label || (a.kind === 'timer' ? "Time's up" : 'Wake up!')}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => snooze(a)} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
              Snooze {SNOOZE_MIN}m
            </button>
            <button onClick={() => dismiss(a.id)} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110">
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Header button + popover listing active alarms/timers with a cancel button for each. */
export function AlarmsButton() {
  const alarms = useAlarms();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const [perm, setPerm] = useState<string>('unsupported');

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Alarms and timers"
        title="Alarms and timers"
        className="relative rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
      >
        <BellIcon />
        {alarms.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-black">{alarms.length}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] animate-pop rounded-2xl border border-white/10 bg-surface/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-medium text-zinc-100">Alarms & timers</p>
              {alarms.length > 0 && (
                <button onClick={() => clearAlarms()} className="text-xs text-zinc-500 hover:text-red-300">
                  Clear all
                </button>
              )}
            </div>
            {alarms.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-zinc-500">Nothing scheduled. Try “wake me at 6:30” or “timer for 10 minutes”.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto scroll-thin">
                {alarms.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-100">{a.label || (a.kind === 'timer' ? 'Timer' : 'Alarm')}</p>
                      <p className="text-xs text-zinc-500">
                        {formatWhen(a.at)} · in {formatDuration(a.at - Date.now())}
                        {a.repeat !== 'none' ? ` · ${a.repeat}` : ''}
                      </p>
                    </div>
                    <button onClick={() => removeAlarm(a.id)} aria-label="Cancel" className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                      <CloseIcon width={14} height={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 px-1 text-[11px] leading-snug text-zinc-600">
              Alarms ring while this page is open in a browser tab (a background tab is fine; a closed one is not).
            </p>
            {perm === 'default' && (
              <button
                onClick={() => Notification.requestPermission().then(setPerm)}
                className="mt-2 w-full rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
              >
                Enable desktop notifications
              </button>
            )}
            {perm === 'denied' && <p className="mt-2 px-1 text-[11px] text-red-300/80">Notifications are blocked in your browser settings.</p>}
          </div>
        </>
      )}
    </div>
  );
}
