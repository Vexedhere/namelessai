'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechQueue, getRecognitionCtor, ttsSupported, type RecLike } from './voice';
import { keepAwake } from './deviceTools';
import { playChime } from './sound';
import { matchCommand, matchWake, startsWithFiller } from './wake';

/**
 * 'standby'  = hands-free, waiting to hear the wake word (the AI's name)
 * 'listening'= microphone open and the next thing you say goes to the AI
 */
export type VoiceState = 'off' | 'standby' | 'listening' | 'thinking' | 'speaking';

/**
 * push – tap the mic, talk, it answers, listens again; stops itself after a few silent tries (original behaviour)
 * wake – always listening in the background; only reacts after "hey <name>", then keeps the conversation open for a while
 * open – always listening and answers everything it hears
 */
export type ListenMode = 'push' | 'wake' | 'open';

/** After you speak to it (or it finishes answering) it keeps listening this long without needing the wake word again. */
const FOLLOWUP_MS = 30_000;

/**
 * Hands-free conversation loop:  listen → (page sends the text) → speak the reply as it streams → listen…
 *
 * The page tells us when it is busy (`setBusy`) and when it is waiting for a spoken yes/no
 * (`setAwaitingConfirm`); we only open the microphone when we are NOT speaking, so the assistant
 * never transcribes itself.
 */
export function useVoiceMode(opts: {
  lang: string;
  onUtterance: (text: string) => void;
  /** names that wake it up in 'wake' mode */
  wakeWords?: string[];
  /** short status messages worth showing/speaking ("Okay, I'll wait for my name.") */
  onNotice?: (msg: string) => void;
}) {
  const [state, setState] = useState<VoiceState>('off');
  const [mode, setModeState] = useState<ListenMode>('push');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  // computed after mount so server and client render the same HTML
  const [support, setSupport] = useState({ stt: false, tts: false });
  useEffect(() => setSupport({ stt: !!getRecognitionCtor(), tts: ttsSupported() }), []);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const confirmRef = useRef(false);
  const listeningRef = useRef(false);
  const recRef = useRef<RecLike | null>(null);
  const strikes = useRef(0);
  const modeRef = useRef<ListenMode>('push');
  const awakeUntil = useRef(0);
  const restarts = useRef<number[]>([]);
  const netErrors = useRef(0);
  const speakerRef = useRef<SpeechQueue | null>(null);
  const maybeListenRef = useRef<() => void>(() => {});

  const persistent = () => modeRef.current !== 'push';
  const isAwake = () => modeRef.current !== 'wake' || Date.now() < awakeUntil.current;
  const wakeUp = () => {
    awakeUntil.current = Date.now() + FOLLOWUP_MS;
  };
  const idleState = (): VoiceState => (isAwake() ? 'listening' : 'standby');

  const speaker = useCallback(() => {
    if (!speakerRef.current) {
      const q = new SpeechQueue();
      q.onStart = () => activeRef.current && setState('speaking');
      q.onDrain = () => {
        if (modeRef.current === 'wake') wakeUp(); // the follow-up window starts when it stops talking
        maybeListenRef.current();
      };
      speakerRef.current = q;
    }
    speakerRef.current.lang = optsRef.current.lang;
    return speakerRef.current;
  }, []);

  const stopRec = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    listeningRef.current = false;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
    setInterim('');
  }, []);

  const stop = useCallback(
    (reason?: string) => {
      activeRef.current = false;
      busyRef.current = false;
      confirmRef.current = false;
      modeRef.current = 'push';
      awakeUntil.current = 0;
      setModeState('push');
      stopRec();
      speakerRef.current?.cancel();
      void keepAwake(false);
      setState('off');
      setError(reason ?? null);
    },
    [stopRec],
  );

  const setMode = useCallback(
    (m: ListenMode) => {
      if (m === modeRef.current) return;
      modeRef.current = m;
      setModeState(m);
      awakeUntil.current = 0;
      if (!activeRef.current) return;
      if (m === 'push') void keepAwake(false);
      stopRec(); // reopen with the right settings
      if (!busyRef.current && !speakerRef.current?.speaking) setState(m === 'wake' ? 'standby' : 'listening');
      maybeListenRef.current();
    },
    [stopRec],
  );

  /** Handles one finished phrase. Returns true when it was sent on to the AI. */
  const deliver = useCallback(
    (raw: string): boolean => {
      let t = raw.trim();
      if (!t) return false;
      const m = modeRef.current;
      const hit = m === 'push' ? null : matchWake(t, optsRef.current.wakeWords ?? ['nameless']);

      if (m === 'wake' && !isAwake()) {
        if (!hit) return false; // not talking to us: ignore, keep listening
        t = hit.rest;
        wakeUp();
        playChime('wake');
        setState('listening');
        if (!t) return false; // just the name: now it is listening
      } else if (hit && startsWithFiller(t)) {
        t = hit.rest; // "hey nameless, what's the time"
        if (!t) {
          wakeUp();
          playChime('wake');
          return false;
        }
      }

      const cmd = m === 'push' ? null : matchCommand(t);
      if (cmd) {
        const say = (msg: string) => optsRef.current.onNotice?.(msg);
        if (cmd === 'off') {
          playChime('sleep');
          stop();
        } else if (cmd === 'sleep') {
          playChime('sleep');
          awakeUntil.current = 0;
          if (m === 'open') {
            setMode('wake');
            say('Okay. I’ll wait until you say my name.');
          } else setState('standby');
        } else if (cmd === 'open_mic') {
          setMode('open');
          say('Okay, I’ll respond to everything I hear.');
        } else {
          setMode('wake');
          say('Okay, I’ll wait until you say my name.');
        }
        return false;
      }

      if (m === 'wake') wakeUp();
      strikes.current = 0;
      stopRec();
      setState('thinking');
      optsRef.current.onUtterance(t);
      return true;
    },
    [setMode, stop, stopRec],
  );

  const startListening = useCallback(() => {
    if (!activeRef.current || listeningRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      stop('Voice input is not supported in this browser. Try Chrome, Edge or Safari.');
      return;
    }
    const always = persistent();
    const rec = new Ctor();
    rec.lang = optsRef.current.lang;
    rec.continuous = always; // always-on keeps one session open and handles each phrase as it is finished
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    let lastInterim = '';

    rec.onresult = (e) => {
      let live = '';
      let finished = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finished += r[0].transcript;
        else live += r[0].transcript;
      }
      netErrors.current = 0;
      if (always) {
        if (finished.trim()) {
          lastInterim = '';
          setInterim('');
          deliver(finished);
          if (listeningRef.current) setState(idleState());
        } else {
          lastInterim = live;
          setInterim(isAwake() ? live.trim() : '');
        }
        return;
      }
      finalText += finished;
      lastInterim = live;
      setInterim((finalText + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stop('Microphone access is blocked. Allow it in your browser’s site settings, then try again.');
      } else if (e.error === 'network') {
        if (!always || ++netErrors.current > 3) stop('Speech recognition needs an internet connection.');
      } else if (e.error === 'audio-capture') {
        stop('No microphone was found.');
      }
      /* 'no-speech' / 'aborted': handled in onend */
    };
    rec.onend = () => {
      const mine = recRef.current === rec;
      listeningRef.current = false;
      if (mine) recRef.current = null;
      setInterim('');
      if (!activeRef.current || !mine) return;

      if (always) {
        // Browsers end a session after silence or ~1 minute; just open the next one. Guard against restart storms.
        const now = Date.now();
        restarts.current = [...restarts.current.filter((x) => now - x < 10_000), now];
        if (restarts.current.length > 15) {
          stop('The microphone keeps stopping. Check that no other app is using it, then tap the mic to restart.');
          return;
        }
        // text that was said but never marked "final" (some browsers) still counts
        if (lastInterim.trim() && !busyRef.current) deliver(lastInterim);
        setTimeout(() => maybeListenRef.current(), 250);
        return;
      }

      const text = (finalText || lastInterim).trim();
      if (text) {
        strikes.current = 0;
        setState('thinking');
        optsRef.current.onUtterance(text);
      } else if (++strikes.current >= 4) {
        stop('Stopped listening because I didn’t hear anything. Tap the mic to start again.');
      } else {
        setTimeout(() => maybeListenRef.current(), 150);
      }
    };

    try {
      recRef.current = rec;
      listeningRef.current = true;
      rec.start();
      setState(idleState());
    } catch {
      listeningRef.current = false;
      recRef.current = null;
    }
  }, [deliver, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  maybeListenRef.current = () => {
    if (!activeRef.current) return;
    if (speakerRef.current?.speaking) return;
    if (busyRef.current && !confirmRef.current) {
      setState('thinking');
      return;
    }
    startListening();
  };

  const begin = useCallback((m: ListenMode, greeting?: string) => {
    if (!getRecognitionCtor()) {
      setError('Voice input is not supported in this browser. Try Chrome, Edge or Safari.');
      return;
    }
    SpeechQueue.unlock(); // must happen inside the click
    activeRef.current = true;
    strikes.current = 0;
    netErrors.current = 0;
    restarts.current = [];
    modeRef.current = m;
    setModeState(m);
    awakeUntil.current = 0;
    setError(null);
    if (m !== 'push') {
      void keepAwake(true); // a sleeping screen silences the microphone on phones
      playChime('wake');
    }
    if (greeting && ttsSupported()) {
      // speak first; the microphone opens when the greeting has finished (so it never hears itself)
      setState('speaking');
      speaker().say(greeting);
    }
    maybeListenRef.current();
  }, [speaker]);

  /** Tap-to-talk. Pass a greeting to have the AI introduce itself before it starts listening. */
  const start = useCallback((greeting?: string) => begin('push', greeting), [begin]);
  /** Always-listening mode. 'wake' waits for the AI's name; 'open' answers everything it hears. */
  const startHandsFree = useCallback((m: 'wake' | 'open' = 'wake', greeting?: string) => begin(m, greeting), [begin]);

  /** Go back to waiting for the wake word (in open-mic mode this switches to wake mode). */
  const sleep = useCallback(() => {
    if (!activeRef.current) return;
    if (modeRef.current === 'open') setMode('wake');
    awakeUntil.current = 0;
    if (!busyRef.current && !speakerRef.current?.speaking) setState('standby');
  }, [setMode]);

  /** Page → hook: a request is in flight (true) / finished (false). */
  const setBusy = useCallback(
    (b: boolean) => {
      busyRef.current = b;
      if (b) {
        if (activeRef.current) {
          stopRec();
          setState('thinking');
        }
      } else {
        maybeListenRef.current();
      }
    },
    [stopRec],
  );

  const setAwaitingConfirm = useCallback((b: boolean) => {
    confirmRef.current = b;
    if (b) maybeListenRef.current();
  }, []);

  /** Skip the rest of what is being said and start listening (barge-in). */
  const interrupt = useCallback(() => {
    speakerRef.current?.cancel();
    if (modeRef.current === 'wake') wakeUp();
    maybeListenRef.current();
  }, []);

  /** Wake-mode follow-up window ran out: go back to waiting for the name. */
  useEffect(() => {
    const id = setInterval(() => {
      if (activeRef.current && modeRef.current === 'wake' && listeningRef.current && Date.now() >= awakeUntil.current) setState((s) => (s === 'listening' ? 'standby' : s));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /** Coming back to the tab: reopen the microphone if the browser closed it while hidden. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && activeRef.current && persistent()) maybeListenRef.current();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && activeRef.current && stop();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      activeRef.current = false;
      stopRec();
      speakerRef.current?.cancel();
      void keepAwake(false);
    };
  }, [stop, stopRec]);

  return {
    state,
    mode,
    active: state !== 'off',
    /** always-listening (wake or open) is on */
    handsFree: state !== 'off' && mode !== 'push',
    interim,
    error,
    supported: support.stt,
    canSpeak: support.tts,
    start,
    startHandsFree,
    setMode,
    sleep,
    stop,
    interrupt,
    setBusy,
    setAwaitingConfirm,
    speaker,
    /** is voice mode switched on (even between states)? Read from callbacks without re-rendering. */
    isActive: () => activeRef.current,
    getMode: () => modeRef.current,
  };
}
