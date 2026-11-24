'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechQueue, getRecognitionCtor, ttsSupported, type RecLike } from './voice';

export type VoiceState = 'off' | 'listening' | 'thinking' | 'speaking';

/**
 * Hands-free conversation loop:  listen → (page sends the text) → speak the reply as it streams → listen…
 *
 * The page tells us when it is busy (`setBusy`) and when it is waiting for a spoken yes/no
 * (`setAwaitingConfirm`); we only open the microphone when we are NOT speaking, so the assistant
 * never transcribes itself.
 */
export function useVoiceMode(opts: { lang: string; onUtterance: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>('off');
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
  const speakerRef = useRef<SpeechQueue | null>(null);
  const maybeListenRef = useRef<() => void>(() => {});

  const speaker = useCallback(() => {
    if (!speakerRef.current) {
      const q = new SpeechQueue();
      q.onStart = () => activeRef.current && setState('speaking');
      q.onDrain = () => maybeListenRef.current();
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
      stopRec();
      speakerRef.current?.cancel();
      setState('off');
      setError(reason ?? null);
    },
    [stopRec],
  );

  const startListening = useCallback(() => {
    if (!activeRef.current || listeningRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      stop('Voice input is not supported in this browser. Try Chrome, Edge or Safari.');
      return;
    }
    const rec = new Ctor();
    rec.lang = optsRef.current.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    let lastInterim = '';

    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      lastInterim = live;
      setInterim((finalText + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stop('Microphone access is blocked. Allow it in your browser’s site settings, then try again.');
      } else if (e.error === 'network') {
        stop('Speech recognition needs an internet connection.');
      } else if (e.error === 'audio-capture') {
        stop('No microphone was found.');
      }
      /* 'no-speech' / 'aborted': handled in onend */
    };
    rec.onend = () => {
      listeningRef.current = false;
      recRef.current = null;
      setInterim('');
      if (!activeRef.current) return;
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
      setState('listening');
    } catch {
      listeningRef.current = false;
      recRef.current = null;
    }
  }, [stop]);

  maybeListenRef.current = () => {
    if (!activeRef.current) return;
    if (speakerRef.current?.speaking) return;
    if (busyRef.current && !confirmRef.current) {
      setState('thinking');
      return;
    }
    startListening();
  };

  const start = useCallback(() => {
    if (!getRecognitionCtor()) {
      setError('Voice input is not supported in this browser. Try Chrome, Edge or Safari.');
      return;
    }
    SpeechQueue.unlock(); // must happen inside the click
    activeRef.current = true;
    strikes.current = 0;
    setError(null);
    maybeListenRef.current();
  }, []);

  /** Page → hook: a request is in flight (true) / finished (false). */
  const setBusy = useCallback((b: boolean) => {
    busyRef.current = b;
    if (b) {
      if (activeRef.current) {
        stopRec();
        setState('thinking');
      }
    } else {
      maybeListenRef.current();
    }
  }, [stopRec]);

  const setAwaitingConfirm = useCallback((b: boolean) => {
    confirmRef.current = b;
    if (b) maybeListenRef.current();
  }, []);

  /** Skip the rest of what is being said and start listening (barge-in). */
  const interrupt = useCallback(() => {
    speakerRef.current?.cancel();
    maybeListenRef.current();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && activeRef.current && stop();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      activeRef.current = false;
      stopRec();
      speakerRef.current?.cancel();
    };
  }, [stop, stopRec]);

  return {
    state,
    active: state !== 'off',
    interim,
    error,
    supported: support.stt,
    canSpeak: support.tts,
    start,
    stop,
    interrupt,
    setBusy,
    setAwaitingConfirm,
    speaker,
    /** is voice mode switched on (even between states)? Read from callbacks without re-rendering. */
    isActive: () => activeRef.current,
  };
}
