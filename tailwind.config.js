/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');
const twColors = require('tailwindcss/colors');

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

// Keep in sync with lib/themes.ts (plain JS here because Tailwind loads this file directly).
const THEMES = {
  sunset: { palettes: ['orange', 'rose', 'amber'], base: '12 8 9', surface: '22 15 16', side: '16 11 12', deep: '9 6 7' },
  nebula: { palettes: ['violet', 'fuchsia', 'indigo'], base: '9 7 20', surface: '17 13 33', side: '12 9 26', deep: '6 5 15' },
  matrix: { palettes: ['emerald', 'teal', 'lime'], base: '5 11 9', surface: '10 21 17', side: '7 15 12', deep: '3 8 6' },
  ocean: { palettes: ['cyan', 'violet', 'fuchsia'], base: '6 8 12', surface: '13 18 25', side: '8 11 16', deep: '5 7 10' },
};
const DEFAULT_THEME = 'sunset';

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
};

const themeVars = (t) => {
  const vars = { '--base': t.base, '--surface': t.surface, '--side': t.side, '--deep': t.deep };
  ['a', 'b', 'c'].forEach((slot, i) => {
    SHADES.forEach((s) => {
      vars[`--${slot}-${s}`] = hexToRgb(twColors[t.palettes[i]][s]);
    });
  });
  return vars;
};

const slotPalette = (slot) =>
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${slot}-${s}) / <alpha-value>)`]));

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The original class names stay (cyan = primary accent, violet = secondary, fuchsia = glow)
        // but now resolve to whichever theme is active.
        cyan: slotPalette('a'),
        violet: slotPalette('b'),
        fuchsia: slotPalette('c'),
        base: 'rgb(var(--base) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        side: 'rgb(var(--side) / <alpha-value>)',
        deep: 'rgb(var(--deep) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        rise: 'rise 0.35s ease-out both',
        pop: 'pop 0.15s ease-out both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const base = { ':root': themeVars(THEMES[DEFAULT_THEME]) };
      for (const [id, t] of Object.entries(THEMES)) base[`:root[data-theme="${id}"]`] = themeVars(t);
      addBase(base);
    }),
  ],
};
