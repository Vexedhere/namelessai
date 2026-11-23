// Runtime colour themes. The palette lives in CSS variables (app/globals.css) and Tailwind's
// `cyan-*` scale points at them, so every accent in the UI re-colours instantly.

export type ThemeDef = { id: string; name: string; swatch: [string, string] };

export const THEMES: ThemeDef[] = [
  { id: 'aurora', name: 'Aurora', swatch: ['#a78bfa', '#e879f9'] },
  { id: 'ember', name: 'Ember', swatch: ['#fb923c', '#f43f5e'] },
  { id: 'emerald', name: 'Emerald', swatch: ['#34d399', '#2dd4bf'] },
  { id: 'ocean', name: 'Ocean', swatch: ['#22d3ee', '#60a5fa'] },
  { id: 'rose', name: 'Rose', swatch: ['#fb7185', '#f0abfc'] },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'aurora';
export const THEME_KEY = 'nameless-labs-ai:theme';

export function getStoredTheme(): string {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v && THEME_IDS.includes(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id: string): boolean {
  if (!THEME_IDS.includes(id)) return false;
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nameless-theme', { detail: id }));
  return true;
}

/** Inline script (runs before first paint) so there is no flash of the wrong theme. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t&&/^[a-z]+$/.test(t))document.documentElement.dataset.theme=t}catch(e){}`;
