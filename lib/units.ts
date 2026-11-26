// Small, dependency-free unit converter used by the `convert_units` tool.

type Table = Record<string, number>; // unit -> factor to the category's base unit

const LENGTH: Table = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 };
const MASS: Table = { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 };
const VOLUME: Table = { ml: 0.001, l: 1, tsp: 0.00492892159375, tbsp: 0.01478676478125, cup: 0.2365882365, floz: 0.0295735295625, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784 };
const SPEED: Table = { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444444, 'ft/s': 0.3048 };
const AREA: Table = { 'sqm': 1, 'sqkm': 1e6, 'sqft': 0.09290304, 'sqyd': 0.83612736, 'acre': 4046.8564224, 'ha': 10000, 'sqmi': 2589988.110336 };
const DATA: Table = { b: 1 / 8, byte: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
const TIME: Table = { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 };

const CATEGORIES: Table[] = [LENGTH, MASS, VOLUME, SPEED, AREA, DATA, TIME];

const ALIASES: Record<string, string> = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', centimeter: 'cm', centimeters: 'cm',
  millimeter: 'mm', millimeters: 'mm', inch: 'in', inches: 'in', '"': 'in', foot: 'ft', feet: 'ft', yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi',
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kgs: 'kg', tonne: 't', tonnes: 't', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb', stone: 'st',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', milliliter: 'ml', milliliters: 'ml', teaspoon: 'tsp', teaspoons: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cups: 'cup', gallon: 'gal', gallons: 'gal', pint: 'pt', pints: 'pt', quart: 'qt', quarts: 'qt', 'fl oz': 'floz', 'fluid ounce': 'floz',
  kph: 'km/h', kmh: 'km/h', 'km/hr': 'km/h', knot: 'kn', knots: 'kn', mps: 'm/s',
  'sq m': 'sqm', 'm2': 'sqm', 'm²': 'sqm', 'sq ft': 'sqft', 'ft2': 'sqft', 'ft²': 'sqft', 'sq km': 'sqkm', 'km²': 'sqkm', acres: 'acre', hectare: 'ha', hectares: 'ha', 'sq mi': 'sqmi',
  bit: 'b', bits: 'b', bytes: 'byte', kilobyte: 'kb', kilobytes: 'kb', megabyte: 'mb', megabytes: 'mb', gigabyte: 'gb', gigabytes: 'gb', terabyte: 'tb', terabytes: 'tb',
  millisecond: 'ms', milliseconds: 'ms', second: 's', seconds: 's', sec: 's', minute: 'min', minutes: 'min', mins: 'min', hour: 'h', hours: 'h', hr: 'h', hrs: 'h',
  days: 'day', weeks: 'week', years: 'year',
  celsius: 'c', fahrenheit: 'f', kelvin: 'k', '°c': 'c', '°f': 'f', degc: 'c', degf: 'f',
};

const norm = (u: string) => {
  const k = u.trim().toLowerCase().replace(/\.$/, '');
  return ALIASES[k] ?? k;
};

const TEMPS = new Set(['c', 'f', 'k']);

function toCelsius(v: number, u: string) {
  return u === 'c' ? v : u === 'f' ? ((v - 32) * 5) / 9 : v - 273.15;
}
function fromCelsius(v: number, u: string) {
  return u === 'c' ? v : u === 'f' ? (v * 9) / 5 + 32 : v + 273.15;
}

export function convertUnits(value: number, from: string, to: string): { ok: true; value: number; from: string; to: string } | { ok: false; error: string } {
  const f = norm(from);
  const t = norm(to);
  if (TEMPS.has(f) && TEMPS.has(t)) return { ok: true, value: fromCelsius(toCelsius(value, f), t), from: f, to: t };
  const cat = CATEGORIES.find((c) => f in c && t in c);
  if (!cat) return { ok: false, error: `Cannot convert "${from}" to "${to}" (unknown unit or different kinds of measurement).` };
  return { ok: true, value: (value * cat[f]) / cat[t], from: f, to: t };
}
