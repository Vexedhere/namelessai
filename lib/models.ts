// Shared, client-safe model catalogue. Provider model IDs and routing stay server-side
// in app/api/chat/route.ts so provider changes never expose credentials to the browser.

export type ModelDef = {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  /** [from, to] gradient colours used for the model orb */
  accent: [string, string];
  /** whether the underlying model reliably supports tool calling (agent actions) */
  tools: boolean;
};

export const MODELS: ModelDef[] = [
  {
    id: 'nameless-ai',
    name: 'NamelessAI Core',
    badge: 'Custom',
    tagline: 'NamelessAI's everyday assistant, powered by a rotating pool of free-tier AI providers.',
    accent: ['#22d3ee', '#a78bfa'],
    tools: true,
  },
  {
    id: 'pulse-nano',
    name: 'Pulse Nano',
    badge: 'Fast',
    tagline: 'Fast default for quick questions, short answers and drafts.',
    accent: ['#34d399', '#22d3ee'],
    tools: false,
  },
  {
    id: 'lyric-flash',
    name: 'Lyric Flash',
    badge: 'Balanced',
    tagline: 'Balanced intelligence with automatic provider fallback.',
    accent: ['#60a5fa', '#818cf8'],
    tools: true,
  },
  {
    id: 'vega-mini',
    name: 'Vega Mini',
    badge: 'Smart',
    tagline: 'Optimised for structured answers and code with provider fallback.',
    accent: ['#f472b6', '#fb923c'],
    tools: true,
  },
  {
    id: 'aether-pro',
    name: 'Aether Pro',
    badge: 'Pro',
    tagline: 'Higher-capability routing for demanding writing and coding tasks.',
    accent: ['#a78bfa', '#f472b6'],
    tools: true,
  },
  {
    id: 'quasar-apex',
    name: 'Quasar Apex',
    badge: 'Apex',
    tagline: 'Reasoning-focused routing for challenging problems.',
    accent: ['#fbbf24', '#f87171'],
    tools: false,
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export const MODEL_IDS = new Set(MODELS.map((m) => m.id));

export function getModel(id: string): ModelDef {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

