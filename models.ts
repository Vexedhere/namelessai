// Shared, client-safe model catalogue. The real OpenRouter slugs live server-side
// in app/api/chat/route.ts so they can be changed without touching the UI.

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
    name: 'NamelessAI (Custom Fine-Tuned)',
    badge: 'Custom',
    tagline: 'Our signature fine-tuned model, tuned for sharp engineering answers.',
    accent: ['#22d3ee', '#a78bfa'],
    tools: true,
  },
  {
    id: 'pulse-nano',
    name: 'Pulse 5.5 Nano',
    badge: 'Fast',
    tagline: 'Featherweight and instant. Best for quick questions and drafts.',
    accent: ['#34d399', '#22d3ee'],
    tools: false,
  },
  {
    id: 'lyric-flash',
    name: 'Lyric 5.5 Flash',
    badge: 'Balanced',
    tagline: 'The everyday all-rounder: fast, fluent and long-context.',
    accent: ['#60a5fa', '#818cf8'],
    tools: true,
  },
  {
    id: 'vega-mini',
    name: 'Vega 5.5 Mini',
    badge: 'Smart',
    tagline: 'Compact but sharp. Strong at structured answers and code.',
    accent: ['#f472b6', '#fb923c'],
    tools: true,
  },
  {
    id: 'aether-pro',
    name: 'Aether 5.5 Pro',
    badge: 'Pro',
    tagline: 'Premium writing and coding quality for demanding work.',
    accent: ['#a78bfa', '#f472b6'],
    tools: true,
  },
  {
    id: 'quasar-apex',
    name: 'Quasar 5.5 Apex',
    badge: 'Apex',
    tagline: 'Deep step-by-step reasoning for the hardest problems.',
    accent: ['#fbbf24', '#f87171'],
    tools: false,
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export const MODEL_IDS = new Set(MODELS.map((m) => m.id));

export function getModel(id: string): ModelDef {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

