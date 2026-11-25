// Runtime colour themes: 26 hues x 15 styles = 390 themes, generated from maths (no giant CSS file).
// Applying a theme sets CSS variables on <html>; Tailwind's `cyan-*`, `accent` and `canvas` colours read them,
// so every accent in the UI re-colours instantly.
//
// Persistence: themes are NOT stored on the device. Signed-in users get their theme saved to their account
// (see app/page.tsx + lib/account.ts). Only a per-tab sessionStorage cache is used to avoid a flash on reload.

export type ThemeDef = { id: string; name: string; swatch: [string, string]; hue: number; style: number };

const HUES: [string, number][] = [
  ['Ruby', 0], ['Ember', 14], ['Tangerine', 28], ['Amber', 40], ['Gold', 50], ['Citron', 62], ['Lime', 78],
  ['Fern', 98], ['Forest', 125], ['Emerald', 148], ['Jade', 162], ['Teal', 175], ['Lagoon', 186], ['Cyan', 196],
  ['Sky', 207], ['Azure', 218], ['Cobalt', 229], ['Indigo', 240], ['Iris', 252], ['Violet', 264], ['Orchid', 276],
  ['Grape', 290], ['Magenta', 305], ['Fuchsia', 322], ['Rose', 338], ['Crimson', 350],
];

// [name, saturation %, background lightness %, background saturation %, accent hue shift, lightness adjust]
const STYLES: [string, number, number, number, number, number][] = [
  ['Classic', 85, 5.5, 40, 40, 0], ['Midnight', 80, 3.5, 55, 30, 0], ['Neon', 100, 3, 30, -50, 2],
  ['Soft', 55, 7, 22, 25, 4], ['Deep', 75, 4.5, 60, 20, -4], ['Pastel', 70, 8, 18, 35, 8],
  ['Dusk', 65, 6, 35, -35, -2], ['Dawn', 90, 6.5, 30, 55, 2], ['Frost', 60, 5, 28, -25, 5],
  ['Smoke', 30, 6, 12, 15, 0], ['Glow', 95, 4, 45, 65, 3], ['Velvet', 60, 5, 55, -20, -5],
  ['Noir', 45, 2.5, 20, 10, -2], ['Mist', 40, 7.5, 15, -15, 6], ['Royal', 80, 4.8, 50, -60, -3],
];

export const HUE_NAMES = HUES.map(([n]) => n);
export const STYLE_NAMES = STYLES.map(([n]) => n);

function hsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const rgb = (c: [number, number, number]) => c.join(' ');
const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

export const THEMES: ThemeDef[] = HUES.flatMap(([hueName, h], hi) =>
  STYLES.map(([styleName, s, , , shift, adj], si) => ({
    id: `${hueName}-${styleName}`.toLowerCase(),
    name: `${hueName} ${styleName}`,
    swatch: [hex(hsl(h, s, 64 + adj)), hex(hsl(h + shift, s, 64 + adj))] as [string, string],
    hue: hi,
    style: si,
  })),
);

export const THEME_COUNT = THEMES.length; // 390
export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'violet-classic';

// The five original theme ids keep working (saved settings, voice commands).
const LEGACY: Record<string, string> = {
  aurora: 'violet-classic', ember: 'ember-classic', emerald: 'emerald-classic', ocean: 'cyan-classic', rose: 'rose-classic',
};
const COLOUR_WORDS: Record<string, string> = {
  red: 'ruby', orange: 'tangerine', yellow: 'gold', green: 'emerald', blue: 'azure', purple: 'violet', pink: 'rose',
  turquoise: 'teal', aqua: 'cyan', navy: 'cobalt', lavender: 'iris', brown: 'amber', violet: 'violet', magenta: 'magenta',
};

export function getTheme(id: string): ThemeDef | undefined {
  const key = LEGACY[id] ?? id;
  return THEMES.find((t) => t.id === key);
}

/** Forgiving lookup for voice/chat: "ruby midnight", "Ocean", "blue neon", "random". */
export function findTheme(query: string): ThemeDef | undefined {
  const q = query.trim().toLowerCase().replace(/\s+theme$/, '');
  if (!q) return undefined;
  if (q === 'random' || q === 'surprise me') return THEMES[Math.floor(Math.random() * THEMES.length)];
  const direct = getTheme(q) ?? getTheme(q.replace(/\s+/g, '-'));
  if (direct) return direct;
  const words = q.split(/[\s-]+/).map((w) => COLOUR_WORDS[w] ?? w);
  const hue = HUE_NAMES.findIndex((n) => words.includes(n.toLowerCase()));
  if (hue < 0) return undefined;
  const style = Math.max(0, STYLE_NAMES.findIndex((n) => words.includes(n.toLowerCase())));
  return THEMES.find((t) => t.hue === hue && t.style === style);
}

export function themeVars(t: ThemeDef): Record<string, string> {
  const [, h] = HUES[t.hue];
  const [, s, bgL, bgS, shift, adj] = STYLES[t.style];
  const L = (l: number) => Math.min(98, Math.max(24, l + adj));
  const stops: [string, number][] = [['50', 96], ['100', 92], ['200', 84], ['300', 74], ['400', 64], ['500', 55], ['600', 46]];
  const vars: Record<string, string> = {};
  for (const [k, l] of stops) vars[`--brand-${k}`] = rgb(hsl(h, k === '50' || k === '100' ? Math.min(s, 95) : s, k === '50' || k === '100' ? l : L(l)));
  vars['--accent'] = rgb(hsl(h + shift, s, L(56)));
  vars['--bg'] = rgb(hsl(h, bgS, bgL));
  return vars;
}

export const THEME_KEY = 'nameless-labs-ai:theme-vars'; // sessionStorage only (per tab), never localStorage

export function getCurrentTheme(): string {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.dataset.theme || DEFAULT_THEME;
}

export function applyTheme(idOrName: string): boolean {
  const t = getTheme(idOrName) ?? findTheme(idOrName);
  if (!t) return false;
  const vars = themeVars(t);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  try {
    sessionStorage.setItem(THEME_KEY, Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';'));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nameless-theme', { detail: t.id }));
  return true;
}

/** Inline script (runs before first paint): re-applies this tab's theme so a reload doesn't flash. */
export const THEME_BOOT_SCRIPT = `try{var v=sessionStorage.getItem('${THEME_KEY}');if(v&&/^[-\\w:;, .#()%]+$/.test(v))document.documentElement.style.cssText=v}catch(e){}`;
