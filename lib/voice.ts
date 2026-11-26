// Browser voice I/O. No servers, no keys:
//   • speech-to-text  → Web Speech API (SpeechRecognition; Chrome, Edge, Safari)
//   • text-to-speech  → speechSynthesis, fed sentence by sentence while the reply streams

// ── minimal typings (not in lib.dom for every TS version) ────────────────────
type RecEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
export type RecLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecCtor = new () => RecLike;

export function getRecognitionCtor(): RecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** "Hindi", "french", "hi" or "hi-IN" → a supported recognition/speech code, or null. */
export function findVoiceLang(q: string): string | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  const hit =
    VOICE_LANGS.find((l) => l.code.toLowerCase() === t) ??
    VOICE_LANGS.find((l) => l.label.toLowerCase().includes(t)) ??
    VOICE_LANGS.find((l) => l.code.toLowerCase().startsWith(t.slice(0, 2) + '-'));
  return hit?.code ?? null;
}

export const VOICE_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
];

export function defaultVoiceLang(): string {
  if (typeof navigator === 'undefined') return 'en-IN';
  const nav = navigator.language || '';
  if (VOICE_LANGS.some((l) => l.code === nav)) return nav;
  const base = nav.split('-')[0];
  return VOICE_LANGS.find((l) => l.code.startsWith(base + '-'))?.code ?? 'en-IN';
}

// ── text cleaning + chunking (pure, unit-tested) ─────────────────────────────

/** Strips Markdown/URLs/emoji so TTS doesn't read symbols aloud. Hides unfinished code fences. */
export function cleanForSpeech(text: string): string {
  let t = text.replace(/```[\s\S]*?```/g, ' ');
  const open = t.indexOf('```');
  if (open >= 0) t = t.slice(0, open);
  t = t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~|]+/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[ \t]+/g, ' ');
  return t;
}

/**
 * Splits `text` (from index `from`) into speakable chunks. While streaming (`final=false`) only
 * complete sentences are returned; the unfinished tail waits for more text. `next` is the index
 * to pass as `from` on the following call.
 */
export function takeSpeakable(text: string, from: number, final: boolean): { chunks: string[]; next: number } {
  const rest = text.slice(from);
  const items: { s: string; start: number; end: number }[] = [];
  const re = /([.!?।‥…]+["')\]]*)(\s+)|(\n+)/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    const textEnd = m[1] ? m.index + m[1].length : m.index;
    const s = rest.slice(pos, textEnd).trim();
    if (s) items.push({ s, start: pos, end: m.index + m[0].length });
    pos = m.index + m[0].length;
  }
  if (final) {
    const tail = rest.slice(pos).trim();
    if (tail) items.push({ s: tail, start: pos, end: rest.length });
    pos = rest.length;
  } else {
    // a very long run without punctuation: cut at a word boundary so TTS doesn't stall
    while (rest.length - pos > 220) {
      const cut = rest.lastIndexOf(' ', pos + 160);
      if (cut <= pos) break;
      items.push({ s: rest.slice(pos, cut).trim(), start: pos, end: cut + 1 });
      pos = cut + 1;
    }
  }

  // merge very short fragments ("Okay.") into the next one for smoother speech
  const chunks: string[] = [];
  let carry = '';
  let carryStart = 0;
  let consumed = 0;
  for (const it of items) {
    if (!carry) carryStart = it.start;
    carry = carry ? `${carry} ${it.s}` : it.s;
    if (carry.length >= 24) {
      chunks.push(carry);
      carry = '';
      consumed = it.end;
    }
  }
  if (carry) {
    if (final) {
      chunks.push(carry);
      consumed = rest.length;
    } else {
      consumed = carryStart; // keep the short fragment for the next call
    }
  } else if (final) {
    consumed = rest.length;
  }
  return { chunks, next: from + consumed };
}

/** Recognises spoken yes/no (English + common Hindi/Hinglish). */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  const t = text.toLowerCase().trim();
  if (/\b(no|nope|nah|cancel|don'?t|do not|stop|never ?mind|abort|nahi|nahin|mat|ruko)\b/.test(t) || /नहीं|नही|रुको|मत/.test(t)) return 'no';
  if (/\b(yes|yeah|yep|yup|sure|send|confirm|go ahead|do it|okay|ok|please do|haan|ha|bhej do|bhejo|kar do)\b/.test(t) || /हाँ|हां|भेज|ठीक/.test(t)) return 'yes';
  return null;
}

// ── TTS queue ────────────────────────────────────────────────────────────────

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const base = lang.split('-')[0].toLowerCase();
  const score = (v: SpeechSynthesisVoice) => {
    const vl = v.lang.replace('_', '-').toLowerCase();
    let s = 0;
    if (vl === lang.toLowerCase()) s += 10;
    else if (vl.startsWith(base)) s += 5;
    else return -1;
    if (/google|natural|neural|enhanced|premium|online/i.test(v.name)) s += 3;
    if (v.localService) s += 1;
    return s;
  };
  return voices.map((v) => [v, score(v)] as const).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export class SpeechQueue {
  lang = 'en-US';
  rate = 1.05;
  pitch = 1;
  volume = 1;
  /** specific voice chosen by the user (SpeechSynthesisVoice.voiceURI); empty = automatic */
  voiceURI = '';
  onStart?: () => void;
  onDrain?: () => void;
  private pending = 0;
  private offset = 0;
  private gen = 0;

  get speaking() {
    return this.pending > 0;
  }
  /** call before streaming a new piece of text */
  begin() {
    this.offset = 0;
  }
  /** `full` is the whole text of the current message so far */
  feed(full: string, final = false) {
    const { chunks, next } = takeSpeakable(cleanForSpeech(full), this.offset, final);
    this.offset = next;
    for (const c of chunks) this.enqueue(c);
  }
  say(text: string) {
    this.begin();
    this.feed(text, true);
  }
  cancel() {
    this.gen++;
    this.pending = 0;
    this.offset = 0;
    if (ttsSupported()) window.speechSynthesis.cancel();
  }
  /** Some browsers (iOS Safari) only allow speech after a user gesture: call from a click. */
  static unlock() {
    if (!ttsSupported()) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
  private enqueue(text: string) {
    if (!ttsSupported() || !text.trim()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang;
    u.rate = this.rate;
    u.pitch = this.pitch;
    u.volume = this.volume;
    const chosen = this.voiceURI ? window.speechSynthesis.getVoices().find((x) => x.voiceURI === this.voiceURI) : null;
    const v = chosen ?? pickVoice(this.lang);
    if (v) u.voice = v;
    const gen = this.gen;
    u.onstart = () => gen === this.gen && this.onStart?.();
    const done = () => {
      if (gen !== this.gen) return;
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) this.onDrain?.();
    };
    u.onend = done;
    u.onerror = done;
    this.pending++;
    window.speechSynthesis.speak(u);
  }
}

/** Fire-and-forget speech (used by alarms), independent of voice mode. */
export function speakOnce(text: string, lang?: string) {
  if (!ttsSupported() || !text.trim()) return;
  try {
    const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
    u.lang = lang || defaultVoiceLang();
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
