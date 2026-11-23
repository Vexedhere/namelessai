// Theme catalogue. Colours are applied through CSS variables (see tailwind.config.js),
// so every existing `cyan-*`, `violet-*` and `fuchsia-*` utility follows the active theme.

export type ThemeId = 'sunset' | 'nebula' | 'matrix' | 'ocean';

export type ThemeDef = {
  id: ThemeId;
  name: string;
  /** Tailwind palette names for the three accent slots (primary / secondary / glow) */
  palettes: [string, string, string];
  /** RGB triplets for surfaces */
  base: string;
  surface: string;
  side: string;
  deep: string;
  /** swatch gradient for the picker */
  swatch: [string, string];
};

export const THEMES: ThemeDef[] = [
  { id: 'sunset', name: 'Sunset', palettes: ['orange', 'rose', 'amber'], base: '12 8 9', surface: '22 15 16', side: '16 11 12', deep: '9 6 7', swatch: ['#fb923c', '#fb7185'] },
  { id: 'nebula', name: 'Nebula', palettes: ['violet', 'fuchsia', 'indigo'], base: '9 7 20', surface: '17 13 33', side: '12 9 26', deep: '6 5 15', swatch: ['#a78bfa', '#e879f9'] },
  { id: 'matrix', name: 'Matrix', palettes: ['emerald', 'teal', 'lime'], base: '5 11 9', surface: '10 21 17', side: '7 15 12', deep: '3 8 6', swatch: ['#34d399', '#2dd4bf'] },
  { id: 'ocean', name: 'Ocean', palettes: ['cyan', 'violet', 'fuchsia'], base: '6 8 12', surface: '13 18 25', side: '8 11 16', deep: '5 7 10', swatch: ['#22d3ee', '#a78bfa'] },
];

export const DEFAULT_THEME: ThemeId = 'sunset';
export const THEME_KEY = 'nameless-labs-ai:theme';
