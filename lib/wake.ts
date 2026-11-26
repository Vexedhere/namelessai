// Wake-word + spoken-command matching for always-listening mode. Pure functions (no DOM), so they are easy to test.

const FILLER = new Set(['hey', 'hi', 'hello', 'ok', 'okay', 'yo', 'hay', 'a', 'oye', 'hei', 'he']);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Speech recognition often mangles names, so allow one edit for longer words. */
const close = (heard: string, want: string) => heard === want || (want.length >= 5 && heard.length >= 4 && lev(heard, want) <= 1) || (want.length >= 8 && lev(heard, want) <= 2);

/**
 * Looks for a wake word at the start of what was heard ("hey nameless what's the weather").
 * Returns the rest of the sentence (may be empty = "just woke me"), or null when it wasn't for us.
 */
export function matchWake(heard: string, wakeWords: string[]): { rest: string } | null {
  const tokens = heard.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const words = tokens.map(norm);
  const names = wakeWords.map(norm).filter(Boolean);
  for (const name of names) {
    const parts = name.split(' ');
    // allow up to 3 leading filler words ("ok hey nameless")
    for (let start = 0; start <= Math.min(3, words.length - parts.length); start++) {
      if (!words.slice(0, start).every((w) => FILLER.has(w))) break;
      const ok = parts.every((p, i) => close(words[start + i] ?? '', p));
      if (ok) {
        const rest = tokens.slice(start + parts.length).join(' ').replace(/^[\s,.:;!?-]+/, '').trim();
        return { rest };
      }
    }
  }
  return null;
}

/** "hey nameless …" / "ok nameless …": the person is clearly addressing the assistant, not just starting a sentence with its name. */
export const startsWithFiller = (heard: string) => FILLER.has(norm(heard.split(/\s+/)[0] ?? ''));

export type SpokenCommand = 'sleep' | 'off' | 'open_mic' | 'wake_mode';

/**
 * Commands about the listening itself, handled instantly without asking the model.
 * Only matched when the WHOLE utterance is the command, so "tell me why I should say goodbye" is not one.
 */
export function matchCommand(heard: string): SpokenCommand | null {
  const t = norm(heard).replace(/^(please|ok|okay|hey)\s+/, '').replace(/\s+(please|now|for now)$/, '');
  if (/^(stop listening|go to sleep|sleep mode|sleep|that is all|that's all|thats all|goodbye|good bye|bye|bye bye|never mind|nevermind|go quiet|be quiet|standby|stand by)$/.test(t)) return 'sleep';
  if (/^(turn off voice|voice off|exit voice mode|end voice mode|stop voice mode|turn off hands free|hands free off|quit listening|stop hands free|so jao|so ja|band karo|sunna band karo)$/.test(t)) return 'off';
  if (/^(always listen|open mic|listen to everything|respond to everything|no wake word|keep listening)$/.test(t)) return 'open_mic';
  if (/^(wait for my name|use wake word|wake word on|only when i say your name|only listen when i say your name)$/.test(t)) return 'wake_mode';
  return null;
}

/** Wake words for an AI name: the full name, its first word, and the product name. */
export function wakeWordsFor(aiName: string | null | undefined): string[] {
  const set = new Set<string>();
  const n = norm(aiName ?? '');
  if (n) {
    set.add(n);
    const first = n.split(' ')[0];
    if (first.length >= 3) set.add(first);
  }
  set.add('nameless');
  return [...set];
}
