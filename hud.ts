import { cleanAiName } from './account';
import { APP_VERSION } from './version';

/** Words that mean the person is asking something, not giving a name. */
const NOT_A_NAME = /^(what|what's|whats|who|when|where|why|how|can|could|will|would|do|does|did|is|are|tell|show|set|open|play|turn|start|stop|send|find|search|remind|wake|call|text)$/i;
const SKIP = /^(skip|default|use (the )?default|keep (it|the default)|no name|nameless ?ai)$/i;

export type SpokenName = { kind: 'name'; name: string } | { kind: 'default' } | { kind: 'retry' };

/** Turns "I'll call you Nova" / "your name is nova please" / "Nova" into a clean display name. */
export function parseSpokenName(raw: string): SpokenName {
  let t = raw
    .trim()
    .replace(/[“”"‘’`]/g, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
  if (!t) return { kind: 'retry' };
  if (SKIP.test(t)) return { kind: 'default' };

  t = t
    .replace(/^(?:(?:ok(?:ay)?|well|um+|uh+|so|hey|hi|yeah|yes|please)[, ]+)+/i, '')
    .replace(/^(?:(?:i(?:'ll| will| want to| wanna| would like to)?\s+)?(?:call|name) you|let'?s (?:call|name) you|your name(?:'s| is| will be| should be)?|you(?:'re| are)(?: now)?(?: called| named)?|call yourself|how about|maybe|it'?s|its|name)\s+/i, '')
    .replace(/\s+(?:please|ok|okay|thanks|thank you|for me)$/i, '')
    .trim();

  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3 || NOT_A_NAME.test(words[0])) return { kind: 'retry' };
  const pretty = words.map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  const name = cleanAiName(pretty);
  return name ? { kind: 'name', name } : { kind: 'retry' };
}

const hello = (first?: string) => (first ? `Hello ${first}.` : 'Hello.');

/** What the AI says out loud the moment voice mode opens. */
export function greetingFor(aiName: string | null, first?: string): string {
  if (aiName) return `${hello(first)} ${aiName} here. Version ${APP_VERSION} is online. How can I help?`;
  return `Welcome${first ? ` ${first}` : ''}. I'm your new AI, version ${APP_VERSION}. What would you like to name me? You can type a name, or just say it.`;
}

/** What it says right after it has been named. */
export function namedLine(name: string, first?: string): string {
  return `${name} it is${first ? `, nice to meet you ${first}` : ''}. Version ${APP_VERSION} is online. How can I help?`;
}
